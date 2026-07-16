import { spawn } from 'node:child_process'

const port = 32181
const expected = Buffer.from('edge-buffer-ok').toString('base64')
let logs = ''
let child

function append(chunk) {
  logs += chunk.toString()
  if (logs.length > 20000) logs = logs.slice(-20000)
}

async function waitForResponse() {
  const deadline = Date.now() + 120000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      const body = await response.text()
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body}`)
      }
      return { body, header: response.headers.get('x-edge-buffer-result') }
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(`server did not become ready: ${lastError}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const forced = new Promise((resolve) => setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
    resolve()
  }, 5000))
  await Promise.race([exited, forced])
}

try {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const result = await waitForResponse()
  if (result.header === expected && result.body.includes('edge-buffer-reproduction')) {
    console.log(`symptom present: Edge Middleware Buffer produced ${result.header}`)
    process.exitCode = 0
  } else {
    console.log(`symptom absent: header=${JSON.stringify(result.header)} body=${JSON.stringify(result.body)}`)
    process.exitCode = 1
  }
} catch (error) {
  console.error(`verification failed: ${error.stack || error}\n${logs}`)
  process.exitCode = 2
} finally {
  await stopServer()
}
