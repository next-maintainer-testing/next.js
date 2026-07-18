import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const root = path.dirname(new URL(import.meta.url).pathname)
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const symptom = /TypeError:\s*Cannot read properties of undefined \(reading ['"]charCodeAt['"]\)/
let child
let logs = ''
let outcome = 2

function append(chunk) {
  logs += chunk.toString()
  if (logs.length > 200_000) logs = logs.slice(-200_000)
}

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function waitForServer(port, deadline) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before accepting requests (${child.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1_000) })
      return response
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('Timed out waiting for the Next.js development server')
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = once(child, 'exit')
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
  }, 5_000)
  await exited
  clearTimeout(timer)
}

try {
  if (!existsSync(nextBin)) throw new Error('Next.js is not installed')
  const port = await freePort()
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const response = await waitForServer(port, Date.now() + 90_000)
  const body = await response.text()
  await new Promise((resolve) => setTimeout(resolve, 1_000))
  const observed = `${logs}\n${body}`

  if (symptom.test(observed)) {
    console.log('REPRODUCED: middleware request crashed with the redis-errors charCodeAt TypeError')
    outcome = 0
  } else if (response.ok && body.includes('Hello, Next.js!')) {
    console.log('ABSENT: request completed and rendered the page without the reported TypeError')
    outcome = 1
  } else {
    console.error(`CHECK_FAILED: request returned HTTP ${response.status} without the reported TypeError`)
    console.error(observed.slice(-8_000))
    outcome = 2
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopChild()
}
