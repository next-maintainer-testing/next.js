import http from 'node:http'
import { spawn } from 'node:child_process'

const nextPort = 32117
const upstreamPort = 32118
const nextOrigin = `http://127.0.0.1:${nextPort}`
const counters = new Map()
let child
let upstream

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(url, childProcess) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (childProcess.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready with code ${childProcess.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

async function requestJson(path) {
  const response = await fetch(`${nextOrigin}${path}`, { cache: 'no-store' })
  const text = await response.text()
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${text}`)
  return JSON.parse(text)
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const process = spawn(command, args, { stdio: 'inherit', ...options })
    process.once('error', reject)
    process.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`))
    })
  })
}

async function closeServer(server) {
  if (!server) return
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function stopChildGroup(childProcess) {
  if (!childProcess || childProcess.exitCode !== null) return
  try { process.kill(-childProcess.pid, 'SIGTERM') } catch {}
  await Promise.race([
    new Promise((resolve) => childProcess.once('exit', resolve)),
    sleep(5000),
  ])
  try { process.kill(-childProcess.pid, 'SIGKILL') } catch {}
}

try {
  upstream = http.createServer((request, response) => {
    const key = request.url
    const value = (counters.get(key) ?? 0) + 1
    counters.set(key, value)
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ value }))
  })
  await new Promise((resolve, reject) => {
    upstream.once('error', reject)
    upstream.listen(upstreamPort, '127.0.0.1', resolve)
  })

  await runCommand('npm', ['run', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}` },
  })

  child = spawn('npm', ['run', 'start', '--', '-p', String(nextPort)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}` },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.stdout.on('data', (chunk) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk) => process.stderr.write(chunk))

  await waitForServer(`${nextOrigin}/api/revalidate`, child)
  let before = await requestJson('/api/tags')
  const observations = []

  for (let attempt = 1; attempt <= 3; attempt++) {
    const revalidation = await requestJson('/api/revalidate')
    const after = await requestJson('/api/tags')
    if (revalidation.revalidated !== true) throw new Error('Revalidation route did not report success')
    observations.push({
      attempt,
      before,
      after,
      tag1Changed: after.tag1 > before.tag1,
      tag2Changed: after.tag2 > before.tag2,
    })
    before = after
  }

  const failures = observations.filter(({ tag1Changed, tag2Changed }) => !(tag1Changed && tag2Changed))
  const symptomPresent = failures.length > 0
  console.log(JSON.stringify({ attempts: observations.length, failures, symptomPresent }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopChildGroup(child)
  await closeServer(upstream)
}
