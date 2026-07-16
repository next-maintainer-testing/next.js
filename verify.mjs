import { createServer } from 'node:http'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
let upstream
let nextProcess
let upstreamHits = 0
let finalCode = 2

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

async function waitForExit(child, label) {
  let output = ''
  child.stdout?.on('data', (chunk) => { output += chunk })
  child.stderr?.on('data', (chunk) => { output += chunk })
  const [code, signal] = await once(child, 'exit')
  if (code !== 0) {
    throw new Error(`${label} failed (${code ?? signal}):\n${output.slice(-8000)}`)
  }
  return output
}

async function unusedPort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function readJson(url, init) {
  const response = await fetch(url, init)
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response.json()
}

async function waitForNext(baseUrl, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited early with ${child.exitCode}`)
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for next start')
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    await once(child, 'exit').catch(() => {})
  }
}

try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })

  upstream = createServer((request, response) => {
    upstreamHits += 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ value: upstreamHits }))
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  const upstreamUrl = `http://127.0.0.1:${upstream.address().port}/value`

  const build = run('npm', ['run', 'build'], {
    env: { ...process.env, UPSTREAM_URL: upstreamUrl },
  })
  await waitForExit(build, 'next build')

  const nextPort = await unusedPort()
  nextProcess = run(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(nextPort)], {
    detached: true,
    env: { ...process.env, UPSTREAM_URL: upstreamUrl },
  })
  let nextLogs = ''
  nextProcess.stdout.on('data', (chunk) => { nextLogs += chunk })
  nextProcess.stderr.on('data', (chunk) => { nextLogs += chunk })
  const baseUrl = `http://127.0.0.1:${nextPort}`
  await waitForNext(baseUrl, nextProcess)

  const first = await readJson(`${baseUrl}/api/data`)
  const cached = await readJson(`${baseUrl}/api/data`)
  if (first.value !== 1 || cached.value !== 1 || upstreamHits !== 1) {
    throw new Error(`Caching precondition failed: first=${JSON.stringify(first)}, cached=${JSON.stringify(cached)}, upstreamHits=${upstreamHits}\n${nextLogs.slice(-4000)}`)
  }

  await readJson(`${baseUrl}/api/invalidate`, { method: 'POST' })
  const afterInvalidation = await readJson(`${baseUrl}/api/data`)

  if (afterInvalidation.value === 1 && upstreamHits === 1) {
    console.log('SYMPTOM_PRESENT: revalidateTag did not invalidate the fetch(new Request(...)) cache entry')
    finalCode = 0
  } else if (afterInvalidation.value === 2 && upstreamHits === 2) {
    console.log('SYMPTOM_ABSENT: revalidateTag invalidated the tagged cache entry and fetched upstream again')
    finalCode = 1
  } else {
    throw new Error(`Unexpected result after invalidation: response=${JSON.stringify(afterInvalidation)}, upstreamHits=${upstreamHits}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  await stopChild(nextProcess)
  if (upstream) {
    upstream.close()
    upstream.closeAllConnections()
  }
}
