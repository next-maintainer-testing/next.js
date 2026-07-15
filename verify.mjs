import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createServer } from 'node:net'

const marker = '<main data-repro="root-not-found">ROOT NOT FOUND MARKER</main>'
const timeoutMs = 90_000
let serverProcess
let desiredExitCode = 2
let logs = ''

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function runBuild() {
  const child = spawn(
    process.execPath,
    ['./node_modules/next/dist/bin/next', 'build'],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })
  const { code, signal } = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  if (code !== 0) throw new Error(`next build failed (code ${code}, signal ${signal ?? 'none'})`)
}

async function waitForServer(url) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${serverProcess.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

async function stopServer() {
  if (!serverProcess) return
  const closed = serverProcess.exitCode === null
    ? new Promise((resolve) => serverProcess.once('close', resolve))
    : Promise.resolve()

  try {
    process.kill(-serverProcess.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await Promise.race([closed, sleep(2_000)])
  try {
    process.kill(-serverProcess.pid, 'SIGKILL')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  if (serverProcess.exitCode === null) await closed
}

try {
  await rm('.next', { recursive: true, force: true })
  await runBuild()

  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  serverProcess = spawn(
    process.execPath,
    ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  serverProcess.stdout.on('data', (chunk) => { logs += chunk.toString() })
  serverProcess.stderr.on('data', (chunk) => { logs += chunk.toString() })

  await waitForServer(`${origin}/`)
  const response = await fetch(`${origin}/memberships/benefits/missing`)
  const body = await response.text()
  const renderedRootNotFound = body.includes(marker)
  const errorShell = body.includes('<html id="__next_error__">')
  const symptomPresent = response.status >= 400 && !renderedRootNotFound

  console.log(JSON.stringify({
    status: response.status,
    renderedRootNotFound,
    errorShell,
    symptomPresent,
  }))

  desiredExitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  if (logs) console.error(logs.slice(-8000))
  desiredExitCode = 2
} finally {
  process.exitCode = desiredExitCode
  await stopServer()
}
