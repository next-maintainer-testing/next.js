import { spawn } from 'node:child_process'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = `${cwd}node_modules/next/dist/bin/next`
const children = new Set()
const logs = { dev: '', build: '' }

function appendLog(name, chunk) {
  logs[name] = (logs[name] + chunk.toString()).slice(-12000)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function start(name, args) {
  const child = spawn(process.execPath, [nextBin, ...args], {
    cwd,
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.stdout.on('data', (chunk) => appendLog(name, chunk))
  child.stderr.on('data', (chunk) => appendLog(name, chunk))
  child.once('exit', () => children.delete(child))
  return child
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode })
  }
  return Promise.race([
    new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal }))),
    delay(timeoutMs).then(() => null),
  ])
}

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' })
  return { status: response.status, body: await response.text() }
}

async function pageHealth(url, suffix) {
  const page = await get(`${url}/?${suffix}`)
  const hasMarker = page.body.includes('data-repro-marker="issue-61228"')
  if (page.status !== 200 || !hasMarker) {
    return { healthy: false, detail: `page HTTP ${page.status}, marker=${hasMarker}` }
  }

  const assetPaths = [...page.body.matchAll(/(?:src|href)="(\/_next\/static\/[^"?#]+(?:\?[^"#]*)?)"/g)]
    .map((match) => match[1].replaceAll('&amp;', '&'))
  const uniqueAssets = [...new Set(assetPaths)]
  if (uniqueAssets.length === 0) {
    return { healthy: false, detail: 'page contained no Next.js static assets' }
  }
  for (const path of uniqueAssets) {
    const asset = await get(new URL(path, url).href)
    if (asset.status !== 200) {
      return { healthy: false, detail: `asset ${path} returned HTTP ${asset.status}` }
    }
  }
  return { healthy: true, detail: `page and ${uniqueAssets.length} static assets returned HTTP 200` }
}

async function waitUntilHealthy(url, child) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`next dev exited before becoming ready (${child.exitCode ?? child.signalCode})`)
    }
    try {
      const result = await pageHealth(url, `initial=${Date.now()}`)
      if (result.healthy) return result
    } catch {}
    await delay(500)
  }
  throw new Error('next dev did not serve a healthy page and its static assets within 90 seconds')
}

async function cleanup() {
  const active = [...children]
  for (const child of active) {
    try { process.kill(-child.pid, 'SIGTERM') } catch {}
  }
  await Promise.all(active.map((child) => waitForExit(child, 5000)))
  for (const child of active) {
    if (child.exitCode === null && child.signalCode === null) {
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }
  }
  await Promise.all(active.map((child) => waitForExit(child, 2000)))
}

async function check() {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  const dev = start('dev', ['dev', '-H', '127.0.0.1', '-p', String(port)])
  const initial = await waitUntilHealthy(url, dev)
  console.log(`Initial development response is healthy on port ${port}: ${initial.detail}.`)

  const build = start('build', ['build'])
  const buildResult = await waitForExit(build, 180000)
  if (!buildResult) throw new Error('next build did not finish within 180 seconds')
  if (buildResult.code !== 0) {
    throw new Error(`next build failed (${buildResult.code ?? buildResult.signal})\n${logs.build}`)
  }
  console.log('next build completed while next dev remained active.')

  let lastObservation = 'no request attempted'
  for (let attempt = 1; attempt <= 20; attempt++) {
    try {
      const result = await pageHealth(url, `afterBuild=${Date.now()}-${attempt}`)
      lastObservation = result.detail
      if (!result.healthy) {
        console.log(`SYMPTOM PRESENT: post-build development page is broken (${result.detail}).`)
        return 0
      }
    } catch (error) {
      lastObservation = `request failed: ${error.message}`
      console.log(`SYMPTOM PRESENT: post-build development request failed (${error.message}).`)
      return 0
    }
    await delay(500)
  }

  console.log(`SYMPTOM ABSENT: development page stayed healthy after next build (${lastObservation}).`)
  return 1
}

let outcome = 2
try {
  outcome = await check()
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  if (logs.dev) console.error(`--- next dev log ---\n${logs.dev}`)
  if (logs.build) console.error(`--- next build log ---\n${logs.build}`)
}
process.exitCode = outcome
await cleanup()
