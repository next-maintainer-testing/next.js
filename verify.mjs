import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const cwd = process.cwd()
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let server

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed (${signal || code})`))
    })
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.on('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function fetchWhenReady(url) {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Next.js server did not become ready: ${lastError}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }),
  ])
}

try {
  await run(process.execPath, [nextBin, 'build'])

  const port = await reservePort()
  const origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', chunk => { serverLog += chunk; process.stdout.write(chunk) })
  server.stderr.on('data', chunk => { serverLog += chunk; process.stderr.write(chunk) })

  const html = await fetchWhenReady(`${origin}/`)
  const scriptPaths = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)]
    .map(match => match[1].replaceAll('&amp;', '&'))
  if (scriptPaths.length === 0) throw new Error('The rendered page referenced no external JavaScript assets')

  const assets = []
  for (const scriptPath of new Set(scriptPaths)) {
    const url = new URL(scriptPath, origin)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch ${url.pathname}: HTTP ${response.status}`)
    assets.push({ pathname: url.pathname, source: await response.text() })
  }

  const legacyPolyfills = [
    ['String.trimStart/trimEnd', '"trimStart"in String.prototype', '"trimEnd"in String.prototype'],
    ['Array.flat/flatMap', 'Array.prototype.flat||(Array.prototype.flat=function', 'Array.prototype.flatMap=function'],
    ['Promise.finally', 'Promise.prototype.finally||(Promise.prototype.finally=function'],
    ['Object.fromEntries', 'Object.fromEntries||(Object.fromEntries=function'],
    ['Array.at', 'Array.prototype.at||(Array.prototype.at=function'],
    ['Object.hasOwn', 'Object.hasOwn||(Object.hasOwn=function'],
  ]

  let strongest = { pathname: '', names: [] }
  for (const asset of assets) {
    const names = legacyPolyfills
      .filter(([, ...markers]) => markers.every(marker => asset.source.includes(marker)))
      .map(([name]) => name)
    if (names.length > strongest.names.length) strongest = { pathname: asset.pathname, names }
  }

  const reproduced = strongest.names.length >= 3
  process.exitCode = reproduced ? 0 : 1
  if (reproduced) {
    console.log(`SYMPTOM PRESENT: the rendered page loads ${strongest.pathname}, which contains ${strongest.names.length} legacy polyfills: ${strongest.names.join(', ')}`)
  } else {
    console.log(`SYMPTOM ABSENT: fetched ${assets.length} JavaScript assets referenced by the rendered page; no asset contained the legacy polyfill set (maximum matches in one asset: ${strongest.names.length})`)
  }
} catch (error) {
  process.exitCode = 2
  console.error(`CHECK FAILED: ${error.stack || error}`)
} finally {
  await stopServer()
}
