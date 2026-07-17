import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cwd = path.dirname(fileURLToPath(import.meta.url))
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')
let child
let output = ''
let closed

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = address.port
  await new Promise((resolve) => server.close(resolve))
  return port
}

function hasLocationDiagnostic(text) {
  return /middleware[^\n]*(?:invalid|incorrect|outside|location|must be|should be)[^\n]*(?:root|src|folder|director)|(?:invalid|incorrect|outside|location)[^\n]*middleware/i.test(text)
}

async function stopChild() {
  if (!child || child.exitCode !== null) {
    if (closed) await closed
    return
  }
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    closed.then(() => true),
    delay(5000).then(() => false),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await closed
  }
}

async function verify() {
  const port = await availablePort()
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  closed = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })))
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const deadline = Date.now() + 90000
  let response
  let lastError
  while (Date.now() < deadline && child.exitCode === null) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(5000) })
      if (response.status < 500) break
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  await delay(500)
  const locationDiagnostic = hasLocationDiagnostic(output)
  if (locationDiagnostic) {
    console.log('Symptom absent: Next.js emitted a middleware-location diagnostic.')
    console.log(output)
    return 1
  }

  if (response) {
    const middlewareActive = response.headers.get('x-root-middleware') === 'active'
    if (middlewareActive) {
      console.log('Symptom present: root middleware compiled and ran without an invalid-location diagnostic.')
      console.log(output)
      return 0
    }
    console.log('Symptom absent: the root middleware did not run.')
    console.log(output)
    return 1
  }

  console.error('Verification failed: the dev server did not become reachable.', lastError ?? '')
  console.error(output)
  return 2
}

try {
  process.exitCode = await verify()
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopChild()
}
