import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { rm } from 'node:fs/promises'

const execFileAsync = promisify(execFile)
const port = 39196
const base = `http://127.0.0.1:${port}`
const TWO_GIB_KB = 2 * 1024 * 1024
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

await rm('.next', { recursive: true, force: true })

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', String(port)],
  { cwd: process.cwd(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
)

let output = ''
for (const stream of [server.stdout, server.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', (chunk) => {
    output = (output + chunk).slice(-12000)
  })
}

let serverExit = null
server.once('exit', (code, signal) => {
  serverExit = { code, signal }
})

async function fetchOk(path) {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  await response.arrayBuffer()
}

async function waitUntilReady() {
  const deadline = Date.now() + 90000
  let lastError
  while (Date.now() < deadline) {
    if (serverExit) throw new Error(`dev server exited early: ${JSON.stringify(serverExit)}`)
    try {
      await fetchOk('/')
      return
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }
  throw new Error(`dev server did not become ready: ${lastError}`)
}

async function processTreeRssKb(rootPid) {
  const { stdout } = await execFileAsync('ps', ['-e', '-o', 'pid=,ppid=,rss='])
  const rows = stdout.trim().split('\n').map((line) => {
    const [pid, ppid, rss] = line.trim().split(/\s+/).map(Number)
    return { pid, ppid, rss }
  }).filter((row) => Number.isFinite(row.pid))
  const selected = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const row of rows) {
      if (selected.has(row.ppid) && !selected.has(row.pid)) {
        selected.add(row.pid)
        changed = true
      }
    }
  }
  return rows.filter((row) => selected.has(row.pid)).reduce((sum, row) => sum + row.rss, 0)
}

async function stopServer() {
  if (serverExit) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    sleep(10000),
  ])
  if (!serverExit) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

let resultCode = 2
try {
  await waitUntilReady()

  for (let id = 0; id < 12; id += 1) {
    await fetchOk(`/page/${id}`)
  }
  await fetchOk('/api/ping?request=warmup')
  await sleep(2000)

  const baselineKb = await processTreeRssKb(server.pid)
  let peakKb = baselineKb

  for (let round = 0; round < 120; round += 1) {
    const requests = []
    for (let id = 0; id < 12; id += 1) {
      requests.push(fetchOk(`/page/${id}?round=${round}`))
      requests.push(fetchOk(`/api/ping?request=${round}-${id}`))
    }
    await Promise.all(requests)
    if (round % 5 === 0) {
      peakKb = Math.max(peakKb, await processTreeRssKb(server.pid))
      if (peakKb >= TWO_GIB_KB) break
    }
  }

  await sleep(3000)
  peakKb = Math.max(peakKb, await processTreeRssKb(server.pid))
  const growthKb = peakKb - baselineKb
  const symptomPresent = peakKb >= TWO_GIB_KB
  console.log(JSON.stringify({
    symptomPresent,
    baselineMiB: Math.round(baselineKb / 1024),
    peakMiB: Math.round(peakKb / 1024),
    growthMiB: Math.round(growthKb / 1024),
    thresholdMiB: 2048,
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(output)
  resultCode = 2
}

process.exitCode = resultCode
try {
  await stopServer()
} catch (error) {
  console.error(`cleanup failed: ${error?.stack || error}`)
  if (process.exitCode === 0 || process.exitCode === 1) process.exitCode = 2
}
