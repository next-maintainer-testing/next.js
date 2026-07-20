import { spawn } from 'node:child_process'
import net from 'node:net'
import WebSocket from 'ws'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.once('exit', resolve)
  })
}

async function waitForHttp(url, child, logs) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`development server exited early (${child.exitCode})\n${logs.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok && (await response.text()).includes('WebSocket/HMR reproduction')) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`development server did not become ready\n${logs.join('')}`)
}

function probeWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const timer = setTimeout(() => {
      socket.terminate()
      reject(new Error(`timed out connecting to ${url}`))
    }, 15_000)

    socket.once('open', () => {
      clearTimeout(timer)
      socket.close()
      resolve({ opened: true, detail: 'WebSocket connection opened' })
    })
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timer)
      response.resume()
      resolve({ opened: false, detail: `upgrade rejected with HTTP ${response.statusCode}` })
    })
    socket.once('error', (error) => {
      clearTimeout(timer)
      resolve({ opened: false, detail: `WebSocket error: ${error.message}` })
    })
  })
}

const port = await reservePort()
const logs = []
const child = spawn(process.execPath, ['server.js'], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, PORT: String(port), NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
child.stderr.on('data', (chunk) => logs.push(chunk.toString()))

let exitCode = 2
try {
  await waitForHttp(`http://127.0.0.1:${port}/`, child, logs)

  const control = await probeWebSocket(`ws://127.0.0.1:${port}/graphql`)
  if (!control.opened) {
    throw new Error(`control WebSocket did not open: ${control.detail}`)
  }

  const hmr = await probeWebSocket(`ws://127.0.0.1:${port}/_next/webpack-hmr`)
  if (hmr.opened) {
    console.log(`SYMPTOM_ABSENT: ${hmr.detail}`)
    exitCode = 1
  } else {
    console.log(`SYMPTOM_PRESENT: webpack HMR ${hmr.detail}`)
    exitCode = 0
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  exitCode = 2
}

// Persist the verdict before releasing the final server handle.
process.exitCode = exitCode
child.kill('SIGTERM')
await Promise.race([
  waitForExit(child),
  new Promise((resolve) => setTimeout(() => {
    child.kill('SIGKILL')
    resolve()
  }, 10_000)),
])
