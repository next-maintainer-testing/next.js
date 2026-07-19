import { spawn } from 'node:child_process'
import { rm, access } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
let server = null
let serverExit = null
let serverOutput = ''

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal, output }))
  })
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer()
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      const port = typeof address === 'object' && address ? address.port : null
      listener.close((error) => {
        if (error) reject(error)
        else if (port === null) reject(new Error('Could not allocate a port'))
        else resolve(port)
      })
    })
  })
}

function requestLocal(port) {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: '/', timeout: 500 },
      (response) => {
        response.resume()
        response.once('end', () => resolve(true))
      },
    )
    request.once('timeout', () => request.destroy())
    request.once('error', () => resolve(false))
  })
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function waitForExit(child, milliseconds) {
  if (child.exitCode !== null || child.signalCode !== null) return true
  return await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(milliseconds).then(() => false),
  ])
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  if (!(await waitForExit(server, 5000))) {
    server.kill('SIGKILL')
    await waitForExit(server, 5000)
  }
}

async function check() {
  await rm(path.join(root, '.next'), { recursive: true, force: true })
  const build = await run('npm', ['run', 'build'])
  if (build.code !== 0) {
    console.error(`CHECK_FAILED: next build exited with ${build.code ?? build.signal}`)
    return 2
  }

  const entry = path.join(root, '.next', 'standalone', 'server.js')
  try {
    await access(entry)
  } catch {
    console.error(`CHECK_FAILED: standalone entry was not generated at ${entry}`)
    return 2
  }

  const port = await getFreePort()
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    // Emulate a hosting platform-provided hostname which is not a local
    // container address. A backend that binds this value cannot accept proxy
    // traffic and results in the reported 502-class deployment symptom.
    HOSTNAME: '203.0.113.254',
  }

  server = spawn(process.execPath, [entry], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk
    process.stdout.write(chunk)
  })
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk
    process.stderr.write(chunk)
  })
  serverExit = new Promise((resolve) => {
    server.once('error', (error) => resolve({ error }))
    server.once('exit', (code, signal) => resolve({ code, signal }))
  })

  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (await requestLocal(port)) {
      console.log('SYMPTOM_ABSENT: standalone server accepted an HTTP request')
      return 1
    }
    if (server.exitCode !== null || server.signalCode !== null) break
    await delay(250)
  }

  if (server.exitCode === null && server.signalCode === null) {
    console.error('CHECK_FAILED: server was neither reachable nor terminated')
    return 2
  }

  await serverExit
  if (/EADDRNOTAVAIL/.test(serverOutput)) {
    console.log('SYMPTOM_PRESENT: standalone server could not bind HOSTNAME; an upstream proxy has no reachable backend')
    return 0
  }

  console.error(`CHECK_FAILED: standalone server terminated unexpectedly without EADDRNOTAVAIL`)
  return 2
}

let result = 2
try {
  result = await check()
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error)
  result = 2
} finally {
  // Make the verdict durable before releasing the last referenced child handle.
  process.exitCode = result
  await stopServer()
}
