import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const port = 34060
const reportedMessage = "middleware can not alter response's body"
let child
let output = ''
let result = 2

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/test`, {
        signal: AbortSignal.timeout(2_000),
      })
      if (response.status < 500) return
    } catch {}
    await delay(500)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

function killGroup(signal) {
  if (!child) return
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}

async function stopServer() {
  if (!child) return
  const exited = child.exitCode === null
    ? new Promise((resolve) => child.once('exit', resolve))
    : Promise.resolve()
  killGroup('SIGTERM')
  await Promise.race([exited, delay(10_000)])
  if (child.exitCode === null) {
    killGroup('SIGKILL')
    await exited
  } else {
    killGroup('SIGKILL')
  }
  child.stdout.destroy()
  child.stderr.destroy()
}

try {
  await rm('.next', { recursive: true, force: true })
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  await waitForServer()
  const response = await fetch(`http://127.0.0.1:${port}/api/test`, {
    method: 'OPTIONS',
    headers: { origin: 'https://acme.com' },
    signal: AbortSignal.timeout(15_000),
  })
  await response.text()
  await delay(1_000)

  const symptomPresent = output.toLowerCase().includes(reportedMessage)
  console.log(JSON.stringify({
    symptomPresent,
    status: response.status,
    reportedErrorObserved: symptomPresent,
  }))
  result = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(output.slice(-4000))
  result = 2
} finally {
  process.exitCode = result
  await stopServer()
}
