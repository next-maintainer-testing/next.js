import { spawn } from 'node:child_process'
import { performance } from 'node:perf_hooks'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const port = 32000 + (process.pid % 20000)
const baseUrl = `http://127.0.0.1:${port}/`
const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  NODE_ENV: 'production',
  PORT: String(port),
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function waitForServer(child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(baseUrl, { signal: AbortSignal.timeout(10_000) })
      const body = await response.arrayBuffer()
      if (response.status === 200 && body.byteLength > 500_000) return body.byteLength
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('the server did not produce the expected large SSR page')
}

async function requestOnce() {
  const started = performance.now()
  const response = await fetch(baseUrl, { signal: AbortSignal.timeout(30_000) })
  const body = await response.arrayBuffer()
  return { status: response.status, bytes: body.byteLength, latencyMs: performance.now() - started }
}

async function benchmarkRound() {
  const started = performance.now()
  const responses = await Promise.all(Array.from({ length: 10 }, requestOnce))
  const totalMs = performance.now() - started
  if (responses.some(({ status, bytes }) => status !== 200 || bytes < 500_000)) {
    throw new Error(`invalid SSR response: ${JSON.stringify(responses)}`)
  }
  const latencies = responses.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b)
  return {
    totalMs,
    medianMs: latencies[5],
    minMs: latencies[0],
    maxMs: latencies[latencies.length - 1],
    bytes: responses[0].bytes,
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {}
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ])
  if (!graceful && child.exitCode === null) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await exited
  }
}

let server
try {
  const build = await run(npmCommand, ['run', 'build'])
  if (build.code !== 0) throw new Error(`next build failed (code ${build.code}, signal ${build.signal})`)

  server = spawn(npmCommand, ['run', 'start'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  })
  let serverOutput = ''
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput += chunk.toString()
      if (serverOutput.length > 20_000) serverOutput = serverOutput.slice(-20_000)
    })
  }
  server.once('error', (error) => { serverOutput += `\nserver error: ${error.message}` })

  const warmupBytes = await waitForServer(server)
  const rounds = []
  for (let index = 0; index < 3; index += 1) rounds.push(await benchmarkRound())
  const medianRoundMs = rounds.map(({ totalMs }) => totalMs).sort((a, b) => a - b)[1]
  const symptomPresent = medianRoundMs >= 750
  console.log(JSON.stringify({
    symptom: 'ten simultaneous SSR requests for a representative 500KB-plus page require at least 750ms',
    symptomPresent,
    thresholdMs: 750,
    medianRoundMs: Math.round(medianRoundMs),
    warmupBytes,
    rounds: rounds.map((round) => ({
      totalMs: Math.round(round.totalMs),
      medianMs: Math.round(round.medianMs),
      minMs: Math.round(round.minMs),
      maxMs: Math.round(round.maxMs),
      bytes: round.bytes,
    })),
  }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  if (server) await stopServer(server)
}
