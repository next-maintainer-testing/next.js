import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const port = 32177
const output = []
let childClosed = false
let requestStarted = false
let requestSucceeded = false

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => output.push(chunk.toString()))
child.stderr.on('data', (chunk) => output.push(chunk.toString()))
child.on('close', () => {
  childClosed = true
})

const combinedOutput = () => output.join('')
const symptomPresent = () => {
  const text = combinedOutput()
  return text.includes('ERR_INVALID_ARG_VALUE') && text.includes('null bytes')
}

async function triggerPage() {
  if (requestStarted) return
  requestStarted = true
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      signal: AbortSignal.timeout(20_000),
    })
    const body = await response.text()
    requestSucceeded = response.ok && body.includes('dependency loaded')
  } catch {
    // The reported compiler failure leaves the request pending. Its server log is
    // the direct signal checked below.
  }
}

let result = 2
const deadline = Date.now() + 60_000
while (Date.now() < deadline) {
  const text = combinedOutput()
  if (symptomPresent()) {
    result = 0
    break
  }
  if (!requestStarted && (text.includes('Ready in') || text.includes('started server'))) {
    void triggerPage()
  }
  if (requestSucceeded) {
    result = 1
    break
  }
  if (childClosed) {
    result = symptomPresent() ? 0 : 2
    break
  }
  await delay(100)
}

if (result === 2 && symptomPresent()) result = 0
process.stdout.write(combinedOutput())
process.exitCode = result

if (!childClosed) {
  child.kill('SIGTERM')
  const cleanupDeadline = Date.now() + 5_000
  while (!childClosed && Date.now() < cleanupDeadline) await delay(50)
  if (!childClosed) {
    child.kill('SIGKILL')
    while (!childClosed) await delay(50)
  }
}
