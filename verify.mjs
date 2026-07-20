import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const timeoutMs = 120_000
let child
let combined = ''
let lastResponse = ''
let outcome = 2

function append(chunk) {
  const text = chunk.toString()
  combined = (combined + text).slice(-200_000)
  process.stdout.write(text)
}

function hasSymptom(text) {
  const cleaned = text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
  return cleaned.includes('Module not found') &&
    cleaned.includes('app/components/SidebarContent.tsx')
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ])
  if (!stopped && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await Promise.race([
      closed,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }
}

try {
  const port = await availablePort()
  const nextBin = process.platform === 'win32'
    ? 'node_modules/.bin/next.cmd'
    : 'node_modules/.bin/next'

  child = spawn(nextBin, ['dev', '--turbo', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.once('error', (error) => append(`\nFailed to start Next.js: ${error.stack || error}\n`))

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (hasSymptom(combined) || hasSymptom(lastResponse)) {
      outcome = 0
      console.log('\nVERIFICATION: reproduced Turbopack dynamic-import module resolution error')
      break
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/chat`, {
        signal: AbortSignal.timeout(5_000),
        headers: { accept: 'text/html' },
      })
      lastResponse = await response.text()
      if (hasSymptom(lastResponse) || hasSymptom(combined)) {
        outcome = 0
        console.log('\nVERIFICATION: reproduced Turbopack dynamic-import module resolution error')
        break
      }
      if (response.ok && !/id=["']__next_error__/.test(lastResponse)) {
        outcome = 1
        console.log('\nVERIFICATION: /chat rendered without the reported module resolution error')
        break
      }
    } catch {}

    if (child.exitCode !== null) {
      if (hasSymptom(combined)) {
        outcome = 0
        console.log('\nVERIFICATION: reproduced Turbopack dynamic-import module resolution error')
      } else {
        console.error(`\nCHECK FAILURE: Next.js exited early with code ${child.exitCode}`)
      }
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (Date.now() >= deadline && outcome === 2) {
    console.error('\nCHECK FAILURE: timed out waiting for a conclusive /chat response')
  }
} catch (error) {
  console.error(`\nCHECK FAILURE: ${error.stack || error}`)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopChild()
}
