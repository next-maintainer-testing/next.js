import { spawn } from 'node:child_process'

const port = 3217
const target = `http://127.0.0.1:${port}/`
const expected = /Route "\/" used `searchParams\._debugInfo`\. `searchParams` should be awaited before using its properties\./
let output = ''
let child
let outcome = 2

function append(chunk) {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js dev server exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(target)
      if (response.ok) {
        await response.text()
        return
      }
    } catch {}
    await sleep(500)
  }
  throw new Error('Timed out waiting for the Next.js dev server')
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    sleep(10_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('close', resolve))
  }
}

try {
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  await waitForServer()
  await sleep(2_000)
  outcome = expected.test(output) ? 0 : 1
  console.log(outcome === 0 ? 'SYMPTOM_PRESENT' : 'SYMPTOM_ABSENT')
} catch (error) {
  console.error(error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopServer()
}
