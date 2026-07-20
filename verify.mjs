import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stop(child, closed) {
  if (child.exitCode !== null || child.signalCode !== null) {
    await closed
    return
  }

  child.kill('SIGTERM')
  let timer
  const ended = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => { timer = setTimeout(() => resolve(false), 10000) }),
  ])
  if (timer) clearTimeout(timer)
  if (!ended) {
    child.kill('SIGKILL')
    await closed
  }
}

await rm(path.join(process.cwd(), '.next'), { recursive: true, force: true })
const port = await freePort()
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000)
  })
}
const closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })))

let exitCode = 2
let observation = 'Next.js did not return an auditable response'
const deadline = Date.now() + 120000
while (Date.now() < deadline) {
  if (child.exitCode !== null || child.signalCode !== null) {
    observation = `Next.js exited before serving the page (code=${child.exitCode}, signal=${child.signalCode})`
    break
  }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' })
    const body = await response.text()
    observation = `GET / returned HTTP ${response.status}; body contains ${body.length} bytes`
    if (response.status === 404) exitCode = 0
    else if (response.status >= 200 && response.status < 500) exitCode = 1
    else exitCode = 2
    break
  } catch {
    await sleep(250)
  }
}

process.exitCode = exitCode
await stop(child, closed)
console.log(observation)
if (exitCode === 2) console.error(logs)
