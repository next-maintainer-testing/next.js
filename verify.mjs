import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'

const port = 31000 + (process.pid % 10000)
const origin = `http://127.0.0.1:${port}`
const browserHeaders = {
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36',
}

let logs = ''
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000)
  })
}

const exited = new Promise((resolve) => server.once('exit', resolve))

async function waitUntilReady() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited during startup with ${server.exitCode}\n${logs}`)
    }
    try {
      const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(2000) })
      if (response.ok && (await response.text()) === 'ok') return
    } catch {}
    await delay(250)
  }
  throw new Error(`Next.js did not become ready\n${logs}`)
}

async function requestPage() {
  const response = await fetch(origin, {
    headers: browserHeaders,
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Page returned HTTP ${response.status}`)
  await response.text()
}

async function measureFallback() {
  const started = performance.now()
  const response = await fetch(origin, {
    headers: browserHeaders,
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(`Measured page returned HTTP ${response.status}`)
  if (!response.body) throw new Error('Measured response had no body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    body += decoder.decode(value, { stream: true })
    if (body.includes('id="suspense-fallback"')) {
      const elapsed = performance.now() - started
      await reader.cancel()
      return elapsed
    }
  }
  throw new Error('Suspense fallback marker was not streamed')
}

async function stopServer() {
  if (server.exitCode === null) server.kill('SIGTERM')
  await Promise.race([exited, delay(5000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await exited
  }
}

let outcome = 2
try {
  await waitUntilReady()
  await requestPage()
  const fallbackMilliseconds = await measureFallback()
  const symptomPresent = fallbackMilliseconds >= 1800
  console.log(
    `Suspense fallback first arrived after ${Math.round(fallbackMilliseconds)}ms; ` +
      (symptomPresent ? 'blocked by delayed metadata' : 'streamed before delayed metadata'),
  )
  outcome = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  if (logs) console.error(`Next.js logs:\n${logs}`)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopServer()
}
