import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { rm } from 'node:fs/promises'
import net from 'node:net'

const cwd = process.cwd()
let server = null
let logs = ''

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, output }))
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`standalone server exited with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status === 200) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('standalone server did not become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const closed = once(server, 'close')
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'))
  if ((await Promise.race([closed, timeout])) === 'timeout' && server.exitCode === null) {
    server.kill('SIGKILL')
    await once(server, 'close')
  }
}

try {
  await rm(`${cwd}/.next`, { recursive: true, force: true })
  const build = await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])
  if (build.code !== 0) {
    console.error('CHECK_FAILED: next build failed')
    process.exitCode = 2
  } else {
    const port = await freePort()
    server = spawn(process.execPath, ['.next/standalone/server.js'], {
      cwd,
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        HOSTNAME: '127.0.0.1',
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout.on('data', (chunk) => {
      logs += chunk
      process.stdout.write(chunk)
    })
    server.stderr.on('data', (chunk) => {
      logs += chunk
      process.stderr.write(chunk)
    })

    await waitForServer(`http://127.0.0.1:${port}/`, server)
    const response = await fetch(`http://127.0.0.1:${port}/api/render`)
    const body = await response.text()
    await new Promise((resolve) => setTimeout(resolve, 300))

    const missingTheme = /ENOENT[\s\S]*shiki[\\/]themes[\\/]one-dark-pro\.json/i.test(logs)
    if (response.status >= 500 && missingTheme) {
      console.log('SYMPTOM_PRESENT: standalone runtime omitted shiki/themes/one-dark-pro.json and /api/render failed with ENOENT')
      process.exitCode = 0
    } else if (response.ok) {
      console.log('SYMPTOM_ABSENT: standalone /api/render completed successfully')
      process.exitCode = 1
    } else {
      console.error(`CHECK_FAILED: unexpected HTTP ${response.status}: ${body.slice(0, 500)}`)
      console.error(logs.slice(-2000))
      process.exitCode = 2
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  await stopServer()
}
