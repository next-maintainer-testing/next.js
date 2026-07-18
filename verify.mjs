import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'

const require = createRequire(import.meta.url)
let child = null
let output = ''

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) reject(error)
        else if (port === null) reject(new Error('Could not reserve a port'))
        else resolve(port)
      })
    })
  })
}

function capture(chunk) {
  output += chunk.toString()
  if (output.length > 200_000) output = output.slice(-200_000)
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  return { status: response.status, body: await response.text() }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${output}`)
    }
    try {
      const response = await get(baseUrl)
      if (response.status === 200 && response.body.includes('Main')) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for the reproduction app\n${output}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ])
  if (!stopped && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await closed
  }
}

let exitCode = 2
try {
  const port = await reservePort()
  const nextBin = require.resolve('next/dist/bin/next')
  child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForServer(baseUrl)
  const response = await get(`${baseUrl}/404`)
  if (response.status !== 404) {
    throw new Error(`Expected /404 to return HTTP 404, received ${response.status}\n${output}`)
  }

  if (response.body.includes('Could not find requested resource')) {
    console.log('Symptom absent: /404 rendered the custom (main)/not-found.js content.')
    exitCode = 1
  } else {
    console.log('Symptom present: /404 returned HTTP 404 without rendering the custom (main)/not-found.js content.')
    exitCode = 0
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await stopServer()
  child = null
}
