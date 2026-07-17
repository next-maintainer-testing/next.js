import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'

const symptom = 'The render was aborted by the server without a reason.'
const root = new URL('.', import.meta.url).pathname
let child
let childExited = false
let logs = ''

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function reservePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!port) throw new Error('Could not reserve a local port')
  return port
}

async function waitForReady() {
  for (let attempt = 0; attempt < 600; attempt++) {
    if (/Ready in|started server/i.test(logs)) return
    if (childExited) throw new Error(`Next.js exited before becoming ready\n${logs}`)
    await sleep(100)
  }
  throw new Error(`Timed out waiting for Next.js to become ready\n${logs}`)
}

async function abortStreamingRequest(port) {
  await new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1')
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('Timed out waiting for the streamed response'))
    }, 60000)

    socket.once('connect', () => {
      socket.write('GET / HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n')
    })
    socket.once('data', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve()
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
  })
}

async function stopServer() {
  if (!child || childExited) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    let forceTimer
    const terminateTimer = setTimeout(() => {
      child.kill('SIGKILL')
      forceTimer = setTimeout(resolve, 5000)
    }, 5000)
    child.once('exit', () => {
      clearTimeout(terminateTimer)
      if (forceTimer) clearTimeout(forceTimer)
      resolve()
    })
  })
}

try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
  const port = await reservePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.once('exit', () => { childExited = true })
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  await waitForReady()
  await abortStreamingRequest(port)
  for (let attempt = 0; attempt < 50 && !logs.includes(symptom); attempt++) await sleep(100)

  const reproduced = logs.includes(symptom)
  process.exitCode = reproduced ? 0 : 1
  console.log(JSON.stringify({
    reproduced,
    observed: reproduced ? symptom : 'Development server did not log the reported render-abort error after the client disconnected from a suspended stream.',
  }))
} catch (error) {
  process.exitCode = 2
  console.error(error instanceof Error ? error.stack : error)
} finally {
  await stopServer()
}
