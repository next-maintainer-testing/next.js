import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = process.cwd()
const requestCount = 400
let app = null
let mock = null
let appOutput = ''

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function run(command, args, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`Timed out: ${command} ${args.join(' ')}`))
    }, timeoutMs)
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolvePromise(output)
      else reject(new Error(`Command failed (${code ?? signal}): ${command} ${args.join(' ')}\n${output.slice(-4000)}`))
    })
  })
}

async function waitForReady() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (app.exitCode !== null) throw new Error(`Next.js exited before ready (${app.exitCode})\n${appOutput.slice(-4000)}`)
    try {
      const response = await fetch('http://127.0.0.1:3000/leak')
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`Next.js did not become ready\n${appOutput.slice(-4000)}`)
}

async function sendRequests(count) {
  let completed = 0
  const workers = Array.from({ length: 20 }, async () => {
    while (true) {
      const index = completed++
      if (index >= count) return
      const response = await fetch(`http://127.0.0.1:3000/leak?n=${index}`)
      if (!response.ok) throw new Error(`Request ${index} returned HTTP ${response.status}`)
      await response.arrayBuffer()
    }
  })
  await Promise.all(workers)
}

async function takeSnapshot() {
  const before = new Set((await readdir(root)).filter((name) => name.endsWith('.heapsnapshot')))
  app.kill('SIGUSR2')
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const files = (await readdir(root)).filter((name) => name.endsWith('.heapsnapshot') && !before.has(name))
    if (files.length === 1) {
      const path = resolve(root, files[0])
      try {
        const text = await readFile(path, 'utf8')
        const snapshot = JSON.parse(text)
        await rm(path, { force: true })
        return snapshot
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
      }
    }
    await sleep(250)
  }
  throw new Error('Heap snapshot was not produced in time')
}

function countAbortSignals(snapshot) {
  const fields = snapshot.snapshot.meta.node_fields
  const nameOffset = fields.indexOf('name')
  const width = fields.length
  if (nameOffset < 0 || width < 2) throw new Error('Unexpected heap snapshot node format')
  let count = 0
  for (let index = 0; index < snapshot.nodes.length; index += width) {
    const name = snapshot.strings[snapshot.nodes[index + nameOffset]]
    if (name === 'AbortSignal') count++
  }
  return count
}

async function closeChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolvePromise) => child.once('close', resolvePromise)),
    sleep(5000).then(() => { if (child.exitCode === null) child.kill('SIGKILL') }),
  ])
}

try {
  await rm(resolve(root, '.next'), { recursive: true, force: true })
  await run(process.execPath, [resolve(root, 'node_modules/next/dist/bin/next'), 'build', '--turbopack'], 180_000)

  mock = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain', connection: 'close' })
    response.end('ok')
  })
  await new Promise((resolvePromise, reject) => {
    mock.once('error', reject)
    mock.listen(4000, '127.0.0.1', resolvePromise)
  })

  app = spawn(process.execPath, ['--heapsnapshot-signal=SIGUSR2', resolve(root, 'node_modules/next/dist/bin/next'), 'start', '-p', '3000'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  app.stdout.on('data', (chunk) => { appOutput += chunk })
  app.stderr.on('data', (chunk) => { appOutput += chunk })

  await waitForReady()
  await sleep(1500)
  const baseline = countAbortSignals(await takeSnapshot())
  await sendRequests(requestCount)
  await sleep(2500)
  const after = countAbortSignals(await takeSnapshot())
  const retained = after - baseline
  const threshold = Math.floor(requestCount / 2)

  console.log(JSON.stringify({ next: (await import('./node_modules/next/package.json', { with: { type: 'json' } })).default.version, requestCount, baselineAbortSignals: baseline, afterAbortSignals: after, retainedAbortSignals: retained, symptomThreshold: threshold }))
  process.exitCode = retained >= threshold ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  await closeChild(app)
  if (mock) await new Promise((resolvePromise) => mock.close(resolvePromise))
}
