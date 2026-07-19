import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 3002
const origin = `http://127.0.0.1:${port}`
let output = ''

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)],
  { cwd: new URL('.', import.meta.url), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] }
)

for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-12000)
  })
}

async function waitUntilReady() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited during startup with code ${server.exitCode}`)
    }
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2000) })
      await response.arrayBuffer()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('Timed out waiting for Next.js to start')
}

async function stopServer() {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  const closed = once(server, 'close')
  const ended = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000))
  ])
  if (!ended && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
    await once(server, 'close')
  }
}

try {
  await waitUntilReady()
  const response = await fetch(`${origin}/gssp`, {
    method: 'GET',
    headers: { 'x-now-route-matches': '-1' },
    signal: AbortSignal.timeout(30000)
  })
  const body = await response.text()
  const symptomPresent = response.status === 500
  process.exitCode = symptomPresent ? 0 : 1
  console.log(JSON.stringify({ status: response.status, symptomPresent, body: body.slice(0, 500) }))
} catch (error) {
  process.exitCode = 2
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(output)
} finally {
  await stopServer()
}
