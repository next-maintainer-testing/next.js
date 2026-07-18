import { spawn } from 'node:child_process'
import net from 'node:net'

const host = '127.0.0.1'
const logs = []
let child

function record(chunk) {
  logs.push(String(chunk))
  if (logs.join('').length > 30000) logs.shift()
}

function globalObservations() {
  return [...logs.join('').matchAll(/ISSUE52165_GLOBAL_BEFORE:(undefined|hello)/g)].map((match) => match[1])
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { cache: 'no-store', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function waitUntilReady(origin) {
  const deadline = Date.now() + 120000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetchWithTimeout(`${origin}/api/probe`)
      if (response.ok) return
      lastError = new Error(`readiness returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`next dev did not become ready: ${lastError?.message ?? 'timeout'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 10000)),
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await closed
  }
}

try {
  const port = await freePort()
  const origin = `http://${host}:${port}`
  const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url)
  child = spawn(process.execPath, [nextBin.pathname, 'dev', '-H', host, '-p', String(port)], {
    cwd: new URL('.', import.meta.url),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', record)
  child.stderr.on('data', record)

  await waitUntilReady(origin)

  const requestObservations = []
  let seen = globalObservations().length
  for (let index = 0; index < 12; index += 1) {
    const response = await fetchWithTimeout(`${origin}/?reload=${index}`)
    if (!response.ok) throw new Error(`page reload ${index + 1} returned HTTP ${response.status}`)
    await response.text()
    await new Promise((resolve) => setTimeout(resolve, 250))
    const current = globalObservations()
    requestObservations.push(current.slice(seen))
    seen = current.length
  }

  if (!requestObservations[0].includes('undefined')) {
    throw new Error(`initial module evaluation was not observed: ${JSON.stringify(requestObservations)}`)
  }

  const laterMissingReloads = requestObservations.slice(1).filter((values) => values.includes('undefined')).length
  const symptomPresent = laterMissingReloads >= 2
  const persistenceObserved = requestObservations.slice(1).some((values) => values.includes('hello'))
    || laterMissingReloads === 0
  if (!symptomPresent && !persistenceObserved) {
    throw new Error(`inconclusive evaluation sequence ${JSON.stringify(requestObservations)}`)
  }

  console.log(JSON.stringify({ requestObservations, laterMissingReloads, symptomPresent }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  console.error(logs.join('').slice(-12000))
  process.exitCode = 2
} finally {
  await stopChild()
}
