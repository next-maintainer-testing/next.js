import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const marker = 'ISSUE_51340_MODULE_LOAD:'
let child
let closed
let output = ''
let resultCode = 2

function markerCount() {
  return output.split(marker).length - 1
}

async function getFreePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = address.port
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function requestRoute(port, attempt) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/my-route?attempt=${attempt}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`GET /my-route returned HTTP ${response.status}`)
    }
    const body = await response.json()
    if (typeof body.loadedAt !== 'string') {
      throw new Error('GET /my-route did not return its module load timestamp')
    }
    return body.loadedAt
  } finally {
    clearTimeout(timer)
  }
}

async function waitForRoute(port) {
  const deadline = Date.now() + 120000
  let lastError
  let attempt = 0
  while (Date.now() < deadline) {
    try {
      return await requestRoute(port, `warm-${attempt}`)
    } catch (error) {
      lastError = error
      if (child.exitCode !== null) {
        throw new Error(`Next.js dev server exited early with code ${child.exitCode}`)
      }
      await delay(500)
      attempt += 1
    }
  }
  throw new Error(`Next.js dev server did not serve the route: ${lastError?.message ?? 'timeout'}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  let timeout
  await Promise.race([
    closed,
    new Promise((resolve) => {
      timeout = setTimeout(resolve, 5000)
    }),
  ])
  clearTimeout(timeout)
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await closed
  }
}

try {
  const port = await getFreePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  closed = new Promise((resolve) => child.once('close', resolve))
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const warmLoadedAt = await waitForRoute(port)
  await delay(750)
  const baselineLoads = markerCount()
  const responseTimestamps = []

  for (let index = 0; index < 3; index += 1) {
    await delay(400)
    responseTimestamps.push(await requestRoute(port, index))
    await delay(400)
  }

  await delay(750)
  const totalLoads = markerCount()
  const redundantLoads = totalLoads - baselineLoads
  const symptomPresent = redundantLoads >= 2

  console.log(JSON.stringify({
    warmLoadedAt,
    responseTimestamps,
    baselineLoads,
    totalLoads,
    redundantLoads,
    symptomPresent,
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack ?? error)
  console.error(output.slice(-8000))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopServer()
}
