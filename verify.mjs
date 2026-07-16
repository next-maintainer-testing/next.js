import { spawn } from 'node:child_process'
import path from 'node:path'

const cwd = process.cwd()
const port = 31115
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '--turbopack', '-p', String(port)], {
  cwd,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
let ready = false
let finished = false
let resolveFinished
const finishedPromise = new Promise((resolve) => { resolveFinished = resolve })

function inspect(chunk) {
  output += chunk.toString()
  if (/Ready in|✓ Ready/.test(output)) ready = true
  if (
    output.includes('ERR_WORKER_PATH') &&
    output.includes('[instrumentation-edge]') &&
    output.includes('worker script or module filename must be an absolute path')
  ) {
    finished = true
    resolveFinished('present')
  }
}

child.stdout.on('data', inspect)
child.stderr.on('data', inspect)
child.on('error', (error) => {
  output += `\nspawn error: ${error.stack || error}\n`
  finished = true
  resolveFinished('failed')
})
child.on('exit', (code, signal) => {
  output += `\nnext exited with code ${code} signal ${signal}\n`
  if (!finished) {
    finished = true
    resolveFinished('exited')
  }
})

const deadline = Date.now() + 90_000
let result
while (!finished && Date.now() < deadline) {
  if (ready) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      const body = await response.text()
      await new Promise((resolve) => setTimeout(resolve, 1500))
      if (!finished && response.ok && body.includes('instrumentation reproduction')) {
        finished = true
        resolveFinished('absent')
      }
    } catch {
      // The server may report ready just before it begins accepting requests.
    }
  }
  await Promise.race([
    finishedPromise,
    new Promise((resolve) => setTimeout(resolve, 250)),
  ])
}

if (!finished) {
  finished = true
  resolveFinished('timeout')
}
result = await finishedPromise

if (result === 'present') {
  process.exitCode = 0
} else if (result === 'absent') {
  process.exitCode = 1
} else {
  process.exitCode = 2
}

try {
  process.kill(-child.pid, 'SIGTERM')
} catch {}
await Promise.race([
  new Promise((resolve) => child.once('exit', resolve)),
  new Promise((resolve) => setTimeout(resolve, 5000)),
])
if (child.exitCode === null) {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {}
  await new Promise((resolve) => child.once('exit', resolve))
}

console.log(`verification result: ${result}`)
console.log(output)
