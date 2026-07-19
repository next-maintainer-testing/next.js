import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'

process.exitCode = 2

const BUILD_VALUE = 'value-from-image-build'
const RUNTIME_VALUE = 'value-from-container-runtime'
const cwd = process.cwd()
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runBuild() {
  const child = spawn(process.execPath, [nextBin, 'build'], {
    cwd,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_RUNTIME_VALUE: BUILD_VALUE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
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

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, 180_000)

  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: null, error }))
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  clearTimeout(timer)

  if (timedOut) throw new Error('next build timed out after 180 seconds')
  if (result.error) throw result.error
  if (result.code !== 0) {
    throw new Error(`next build failed with code ${result.code} and signal ${result.signal ?? 'none'}\n${output.slice(-4000)}`)
  }
}

async function reservePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!port) throw new Error('failed to reserve a local port')
  return port
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(5000).then(() => false),
  ])
  if (!exited && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let app
try {
  await rm(path.join(cwd, '.next'), { recursive: true, force: true })
  await runBuild()

  const port = await reservePort()
  app = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_RUNTIME_VALUE: RUNTIME_VALUE,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  app.stdout.on('data', (chunk) => process.stdout.write(chunk))
  app.stderr.on('data', (chunk) => process.stderr.write(chunk))

  const deadline = Date.now() + 60_000
  let html = null
  let lastError = null
  while (Date.now() < deadline) {
    if (app.exitCode !== null || app.signalCode !== null) {
      throw new Error(`next start exited before the page was available (code ${app.exitCode}, signal ${app.signalCode})`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`, {
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        html = await response.text()
        break
      }
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }

  if (html === null) throw new Error(`page did not become available: ${lastError}`)
  const match = html.match(/<p id="env-value">([^<]*)<\/p>/)
  if (!match) throw new Error(`rendered page did not contain #env-value: ${html.slice(0, 1000)}`)

  const renderedValue = match[1]
  console.log(`Rendered #env-value: ${JSON.stringify(renderedValue)}`)
  console.log(`Build value: ${JSON.stringify(BUILD_VALUE)}`)
  console.log(`Runtime value: ${JSON.stringify(RUNTIME_VALUE)}`)

  if (renderedValue === BUILD_VALUE) {
    console.log('SYMPTOM PRESENT: the client-facing value is frozen at build time and ignores the runtime environment.')
    process.exitCode = 0
  } else if (renderedValue === RUNTIME_VALUE) {
    console.log('SYMPTOM ABSENT: the client-facing value comes from the runtime environment.')
    process.exitCode = 1
  } else {
    throw new Error(`unexpected rendered value ${JSON.stringify(renderedValue)}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  if (app) await stopServer(app)
}
