import { spawn } from 'node:child_process'
import { createConnection, createServer } from 'node:net'
import { rm } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

const host = '127.0.0.1'
let child
let output = ''

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const build = spawn(process.execPath, [
      'node_modules/next/dist/bin/next',
      'build',
    ], {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    build.stdout.on('data', (chunk) => { output += chunk.toString() })
    build.stderr.on('data', (chunk) => { output += chunk.toString() })
    build.once('error', reject)
    build.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`next build failed with code ${code}, signal ${signal}\n${output}`))
    })
  })
}

function waitForListening(port, timeoutMs) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = createConnection({ host, port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (child?.exitCode !== null) {
          reject(new Error(`next start exited early with code ${child.exitCode}\n${output}`))
        } else if (Date.now() - started >= timeoutMs) {
          reject(new Error(`Timed out waiting for next start\n${output}`))
        } else {
          setTimeout(tryConnect, 100)
        }
      })
    }
    tryConnect()
  })
}

async function readValue(port) {
  const started = Date.now()
  const response = await fetch(`http://${host}:${port}/`, {
    headers: { connection: 'close' },
  })
  if (!response.ok) {
    throw new Error(`Unexpected HTTP ${response.status}`)
  }
  const html = await response.text()
  const match = html.match(/<div id="cache-value">([^<]+)<\/div>/)
  if (!match) {
    throw new Error(`Could not find cache value in response: ${html.slice(0, 500)}`)
  }
  return { value: match[1], elapsedMs: Date.now() - started }
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

try {
  await rm('.next', { recursive: true, force: true })
  await runBuild()
  const port = await getFreePort()
  child = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'start',
    '--hostname', host,
    '--port', String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  await waitForListening(port, 60000)
  const first = await readValue(port)
  await delay(5500)
  const afterExpiry = await readValue(port)
  await delay(1500)
  const afterRefresh = await readValue(port)
  const symptomPresent = (
    afterExpiry.value === first.value &&
    afterRefresh.value !== first.value
  )

  console.log(JSON.stringify({ first, afterExpiry, afterRefresh, symptomPresent }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stopServer()
}
