import { spawn } from 'node:child_process'
import { mkdir, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const children = []
let observed = ''

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], ...options })
    let output = ''
    child.stdout?.on('data', (chunk) => { output += chunk })
    child.stderr?.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, output }))
  })
}

function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], ...options })
  children.push(child)
  return child
}

async function waitFor(getText, pattern, label, timeoutMs = 60_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (pattern.test(getText())) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}. Output:\n${getText()}`)
}

async function nginxBinary() {
  if (existsSync('/usr/sbin/nginx')) return '/usr/sbin/nginx'

  const tools = path.join(cwd, '.tools')
  const extracted = path.join(tools, 'root', 'usr', 'sbin', 'nginx')
  if (existsSync(extracted)) return extracted

  await mkdir(tools, { recursive: true })
  const download = await run('apt-get', ['download', 'nginx'], { cwd: tools })
  if (download.code !== 0) throw new Error(`Could not download nginx:\n${download.output}`)
  const deb = (await readdir(tools)).find((name) => /^nginx_.*_amd64\.deb$/.test(name))
  if (!deb) throw new Error('The downloaded nginx package was not found')
  await mkdir(path.join(tools, 'root'), { recursive: true })
  const extract = await run('dpkg-deb', ['-x', path.join(tools, deb), path.join(tools, 'root')])
  if (extract.code !== 0) throw new Error(`Could not extract nginx:\n${extract.output}`)
  return extracted
}

async function post(index) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)
  try {
    await fetch(`http://127.0.0.1:3101/missing-${index}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/plain, */*' },
      body: JSON.stringify({ index }),
      signal: controller.signal,
    })
  } catch {
    // The reported proxy/request race can also reset the client side.
  } finally {
    clearTimeout(timer)
  }
}

async function stopChildren() {
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve()
    child.once('close', resolve)
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, 3_000)
  })))
}

try {
  await mkdir(path.join(cwd, 'logs'), { recursive: true })

  const build = await run(process.execPath, [path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  if (build.code !== 0) throw new Error(`next build failed:\n${build.output}`)

  const server = start(process.execPath, ['server.js'], {
    env: { ...process.env, NODE_ENV: 'production', PORT: '3100', NEXT_TELEMETRY_DISABLED: '1' },
  })
  let serverOutput = ''
  server.stdout.on('data', (chunk) => { serverOutput += chunk; observed += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk; observed += chunk })
  await waitFor(() => serverOutput, /READY http:\/\/127\.0\.0\.1:3100/, 'custom server')

  const nginx = await nginxBinary()
  const proxy = start(nginx, ['-p', `${cwd}/`, '-c', path.join(cwd, 'nginx.conf')])
  let nginxOutput = ''
  proxy.stdout.on('data', (chunk) => { nginxOutput += chunk })
  proxy.stderr.on('data', (chunk) => { nginxOutput += chunk })

  const proxyReadyStarted = Date.now()
  while (true) {
    try {
      await fetch('http://127.0.0.1:3101/', { signal: AbortSignal.timeout(2_000) })
      break
    } catch (error) {
      if (Date.now() - proxyReadyStarted > 20_000) {
        throw new Error(`Timed out waiting for nginx: ${error}\n${nginxOutput}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  for (let round = 0; round < 20 && !/UNCAUGHT_EXCEPTION\s+aborted\s+ECONNRESET/i.test(observed); round++) {
    await Promise.all(Array.from({ length: 120 }, (_, index) => post(round * 120 + index)))
  }

  const reproduced = /UNCAUGHT_EXCEPTION\s+aborted\s+ECONNRESET/i.test(observed)
  process.exitCode = reproduced ? 0 : 1
  console.log(reproduced
    ? 'REPRODUCED: custom server emitted uncaught Error: aborted with ECONNRESET'
    : 'NOT_REPRODUCED: no uncaught Error: aborted with ECONNRESET was emitted')
} catch (error) {
  process.exitCode = 2
  console.error(`CHECK_FAILED: ${error && error.stack ? error.stack : error}`)
} finally {
  await stopChildren()
}
