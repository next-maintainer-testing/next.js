import { spawn } from 'node:child_process'
import process from 'node:process'

const port = 32000 + Math.floor(Math.random() * 20000)
const marker = 'ISSUE_58754_SERVER_COMPONENT_THROW'
const fallback = 'Custom error boundary caught the error'
let output = ''

const child = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getPage() {
  const deadline = Date.now() + 90_000
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}`)
    }

    try {
      return await fetch(`http://127.0.0.1:${port}/`, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }

  throw new Error(`Next.js did not serve the page: ${lastError?.message ?? 'timeout'}`)
}

async function stopServer() {
  if (child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}

  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {}
      }
    }),
  ])
}

try {
  const response = await getPage()
  const body = await response.text()
  const renderedFallback = body.includes(fallback)
  const escapedServerError = response.status === 500 &&
    (body.includes(marker) || output.includes(marker))

  if (renderedFallback) {
    process.exitCode = 1
    console.log(`ABSENT: custom boundary fallback rendered (HTTP ${response.status})`)
  } else if (escapedServerError) {
    process.exitCode = 0
    console.log(`PRESENT: server component throw escaped custom boundary (HTTP ${response.status}; fallback absent)`)
  } else {
    process.exitCode = 2
    console.error(`CHECK_FAILED: HTTP ${response.status}; neither fallback nor escaped marked error was observed`)
    console.error(output.slice(-4000))
  }
} catch (error) {
  process.exitCode = 2
  console.error(`CHECK_FAILED: ${error.stack ?? error}`)
  console.error(output.slice(-4000))
} finally {
  await stopServer()
}
