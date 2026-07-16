import { spawn } from 'node:child_process'
import net from 'node:net'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  const closed = new Promise((resolve) => child.once('close', resolve))
  await Promise.race([closed, sleep(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await Promise.race([closed, sleep(2000)])
  }
}

const port = await freePort()
const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  detached: true,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const collect = (chunk) => {
  output += chunk.toString()
  if (output.length > 200000) output = output.slice(-200000)
}
child.stdout.on('data', collect)
child.stderr.on('data', collect)

let response = null
let body = ''
let requestError = null
const deadline = Date.now() + 120000

while (Date.now() < deadline && child.exitCode === null && child.signalCode === null) {
  try {
    response = await fetch(`http://127.0.0.1:${port}/`)
    body = await response.text()
    break
  } catch (error) {
    requestError = error
    await sleep(500)
  }
}

if (response) await sleep(1500)

const normalized = output.replace(/\u001b\[[0-9;]*m/g, '')
const symptom = normalized.includes("You're importing a component that imports react-dom/server")

if (symptom) {
  console.log('SYMPTOM PRESENT: requesting / triggered the react-dom/server import compile error.')
  process.exitCode = 0
} else if (response && response.ok && /<p[^>]*>123<\/p>/.test(body)) {
  console.log('SYMPTOM ABSENT: / compiled and rendered the expected page.')
  process.exitCode = 1
} else {
  console.error('CHECK FAILED: the server did not produce either the reported compile error or the expected page.')
  console.error(`HTTP status: ${response?.status ?? 'none'}`)
  if (requestError) console.error(`Last request error: ${requestError.message}`)
  console.error(normalized.slice(-5000))
  process.exitCode = 2
}

await stop(child)
