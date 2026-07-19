import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const port = 32177
const origin = `http://127.0.0.1:${port}`
let server
let logs = ''
let outcome = 2

function record(chunk) {
  logs += chunk.toString()
  if (logs.length > 12000) logs = logs.slice(-12000)
}

async function waitForServer() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early with ${server.exitCode}\n${logs}`)
    }
    try {
      const response = await fetch(origin, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for next dev\n${logs}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const exited = new Promise((resolve) => server.once('exit', resolve))
  const timer = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'))
  if ((await Promise.race([exited, timer])) === 'timeout' && server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  await rm('.next', { recursive: true, force: true })
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', record)
  server.stderr.on('data', record)

  await waitForServer()
  const response = await fetch(`${origin}/en/about`, { redirect: 'manual' })
  const body = await response.text()

  if (response.status === 404) {
    console.log('SYMPTOM_PRESENT: GET /en/about returned HTTP 404')
    outcome = 0
  } else if (response.status === 200 && body.includes('APP_I18N_ABOUT:en')) {
    console.log('SYMPTOM_ABSENT: GET /en/about rendered the App Router page')
    outcome = 1
  } else {
    console.error(`CHECK_FAILED: unexpected HTTP ${response.status}; marker=${body.includes('APP_I18N_ABOUT:en')}`)
    outcome = 2
  }
} catch (error) {
  console.error('CHECK_FAILED:', error instanceof Error ? error.message : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopServer()
}
