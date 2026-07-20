import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import net from 'node:net'

const HOST = '127.0.0.1'
const REQUEST_TIMEOUT_MS = 3000
const START_TIMEOUT_MS = 30000

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, HOST, () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function waitForPort(port, child) {
  const deadline = Date.now() + START_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited before listening (code ${child.exitCode})`)
    }
    const connected = await new Promise((resolve) => {
      const socket = net.connect({ host: HOST, port })
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
    })
    if (connected) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('timed out waiting for next start')
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

const intervals = new Set()
const sockets = new Set()
const upstream = createServer((request, response) => {
  response.writeHead(200, {
    'content-type': 'text/plain',
    'cache-control': 'no-store',
  })
  response.write('stream-start\n')
  const interval = setInterval(() => response.write('stream-data\n'), 100)
  intervals.add(interval)
  response.once('close', () => {
    clearInterval(interval)
    intervals.delete(interval)
  })
})
upstream.on('connection', (socket) => {
  sockets.add(socket)
  socket.once('close', () => sockets.delete(socket))
})

let nextProcess
try {
  const upstreamPort = await listen(upstream)

  const build = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  const [buildCode] = await once(build, 'exit')
  if (buildCode !== 0) throw new Error(`next build failed with code ${buildCode}`)

  const probe = createServer((request, response) => response.end('occupied'))
  const nextPort = await listen(probe)
  await new Promise((resolve) => probe.close(resolve))

  nextProcess = spawn(
    process.execPath,
    ['./node_modules/next/dist/bin/next', 'start', '-H', HOST, '-p', String(nextPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        UPSTREAM_URL: `http://${HOST}:${upstreamPort}/stream`,
      },
      stdio: 'inherit',
    },
  )
  await waitForPort(nextPort, nextProcess)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let symptomPresent = false
  try {
    const response = await fetch(`http://${HOST}:${nextPort}/`, {
      signal: controller.signal,
    })
    const body = await response.text()
    if (!response.ok || !body.includes('response body cancellation resolved')) {
      throw new Error(`unexpected page response: HTTP ${response.status} ${body.slice(0, 200)}`)
    }
    console.log('ABSENT: response.body.cancel() resolved and the page returned')
  } catch (error) {
    if (error?.name === 'AbortError') {
      symptomPresent = true
      console.log(`PRESENT: page remained pending for ${REQUEST_TIMEOUT_MS}ms while awaiting response.body.cancel()`)
    } else {
      throw error
    }
  } finally {
    clearTimeout(timer)
  }

  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (nextProcess) await stopChild(nextProcess)
  for (const interval of intervals) clearInterval(interval)
  for (const socket of sockets) socket.destroy()
  await new Promise((resolve) => upstream.close(resolve))
}
