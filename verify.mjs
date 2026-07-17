import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { performance } from 'node:perf_hooks'

const port = 31273
const cwd = new URL('.', import.meta.url).pathname
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let server = null
let log = ''

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => { log += chunk.toString() })
    child.stderr.on('data', (chunk) => { log += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function request(pathname) {
  const start = performance.now()
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { cache: 'no-store' })
  const body = await response.text()
  if (!response.ok || body !== 'identical static response\n') {
    throw new Error(`unexpected ${pathname} response: ${response.status} ${JSON.stringify(body)}`)
  }
  return performance.now() - start
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b)
  return ordered[Math.floor(ordered.length / 2)]
}

async function waitUntilReady() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early with ${server.exitCode}`)
    try {
      await request('/baseline.txt')
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('next start did not become ready')
}

async function waitForExit(milliseconds) {
  if (server.exitCode !== null) return true
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), milliseconds)
  })
  const exited = once(server, 'exit').then(() => true)
  const result = await Promise.race([exited, timeout])
  clearTimeout(timer)
  return result
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  if (!(await waitForExit(5_000))) {
    server.kill('SIGKILL')
    await once(server, 'exit')
  }
}

try {
  await run('npm', ['run', 'build'])
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { log += chunk.toString() })
  server.stderr.on('data', (chunk) => { log += chunk.toString() })
  await waitUntilReady()

  for (let i = 0; i < 10; i++) {
    await request('/matched.txt')
    await request('/baseline.txt')
  }

  const matched = []
  const baseline = []
  for (let round = 0; round < 7; round++) {
    const roundMatched = []
    const roundBaseline = []
    for (let i = 0; i < 20; i++) {
      if ((round + i) % 2 === 0) {
        roundMatched.push(await request('/matched.txt'))
        roundBaseline.push(await request('/baseline.txt'))
      } else {
        roundBaseline.push(await request('/baseline.txt'))
        roundMatched.push(await request('/matched.txt'))
      }
    }
    matched.push(median(roundMatched))
    baseline.push(median(roundBaseline))
  }

  const matchedMedian = median(matched)
  const baselineMedian = median(baseline)
  const delta = matchedMedian - baselineMedian
  const ratio = matchedMedian / baselineMedian
  const slowRounds = matched.filter((value, index) =>
    value - baseline[index] >= 0.15 && value / baseline[index] >= 1.10
  ).length
  const symptom = delta >= 0.15 && ratio >= 1.10 && slowRounds >= 5

  console.log(`matched median: ${matchedMedian.toFixed(3)} ms`)
  console.log(`baseline median: ${baselineMedian.toFixed(3)} ms`)
  console.log(`latency delta: ${delta.toFixed(3)} ms; ratio: ${ratio.toFixed(2)}x; slow rounds: ${slowRounds}/7`)
  console.log(symptom ? 'SYMPTOM_PRESENT' : 'SYMPTOM_ABSENT')
  process.exitCode = symptom ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(log.slice(-4000))
  process.exitCode = 2
} finally {
  await stopServer()
}
