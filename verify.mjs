import { spawn } from 'node:child_process'

const port = 32000 + (process.pid % 1000)
const url = `http://127.0.0.1:${port}/api/test`
let output = ''
let child
let outcome = 2

function record(chunk) {
  output += chunk.toString()
  if (output.length > 200_000) output = output.slice(-200_000)
}

async function requestUntilReady(deadline) {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      const body = await response.text()
      return { status: response.status, body }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }
  throw new Error('next dev did not become reachable')
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise(resolve => child.once('close', resolve))
  const forced = new Promise(resolve => {
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 5000)
  })
  await Promise.race([closed, forced])
}

try {
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  const response = await requestUntilReady(Date.now() + 120_000)
  await new Promise(resolve => setTimeout(resolve, 1500))
  const evidence = `${response.body}\n${output}`
  const reportedError = /ReferenceError:\s*Cannot access ['\"]TwitterApiReadWrite['\"] before initialization/.test(evidence)

  if (response.status >= 500 && reportedError) {
    console.log(`REPRODUCED: GET /api/test returned ${response.status} with the reported TwitterApiReadWrite initialization ReferenceError`)
    outcome = 0
  } else if (response.status === 200 && !reportedError) {
    console.log('ABSENT: GET /api/test returned 200 without the reported ReferenceError')
    outcome = 1
  } else {
    console.error(`CHECK FAILED: unexpected HTTP ${response.status}; reported error present=${reportedError}`)
    console.error(evidence.slice(-8000))
    outcome = 2
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  console.error(output.slice(-8000))
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopServer()
}
