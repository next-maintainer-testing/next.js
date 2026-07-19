import { spawn } from 'node:child_process'

const port = 34685
const url = `http://127.0.0.1:${port}/`
const expected = 'Missing getServerSnapshot, which is required for server-rendered content'
let output = ''
let child
let result = 2

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => child.once('close', resolve))
  await Promise.race([closed, delay(5000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('close', resolve))
  }
}

try {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    output += chunk.toString()
  })

  const deadline = Date.now() + 90000
  let response
  let body = ''

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving a response (code ${child.exitCode})`)
    }
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(20000) })
      body = await response.text()
      break
    } catch {
      await delay(500)
    }
  }

  if (!response) throw new Error('Timed out waiting for the Next.js page')
  await delay(500)

  const observed = output.includes(expected) || body.includes(expected)
  if (observed) {
    console.log(`SYMPTOM_PRESENT: server rendering emitted ${JSON.stringify(expected)} (HTTP ${response.status})`)
    result = 0
  } else if (response.ok) {
    console.log(`SYMPTOM_ABSENT: page rendered without the missing getServerSnapshot error (HTTP ${response.status})`)
    result = 1
  } else {
    throw new Error(`Page failed with HTTP ${response.status}, but the reported error was not observed\n${output.slice(-4000)}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  result = 2
} finally {
  process.exitCode = result
  await stopChild()
}
