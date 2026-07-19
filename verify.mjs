import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { once } from 'node:events'

async function availablePort() {
  const socket = net.createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = once(child, 'exit')
  const timer = setTimeout(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
  }, 5000)
  await exited
  clearTimeout(timer)
}

const port = await availablePort()
const nextBin = path.join(process.cwd(), 'node_modules', '.bin', 'next')
let child
let resultCode = 2
let logs = ''

try {
  child = spawn(nextBin, ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  const deadline = Date.now() + 120000
  let response
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}\n${logs}`)
    try {
      response = await fetch(`http://127.0.0.1:${port}/api/probe`)
      if (response.ok) break
      lastError = new Error(`HTTP ${response.status}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (!response?.ok) throw lastError ?? new Error('Timed out waiting for the route handler')

  const observation = await response.json()
  console.log(JSON.stringify(observation))
  if (!observation.contextProvided) {
    throw new Error('The route handler context argument was not provided')
  }
  resultCode = observation.hasWaitUntil === false ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  if (logs) console.error(logs)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stop(child)
}
