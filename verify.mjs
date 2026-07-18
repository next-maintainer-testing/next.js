import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const port = 31000 + (process.pid % 10000)
let server

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

async function fetchPage() {
  const deadline = Date.now() + 30000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError ?? new Error('server did not become ready')
}

try {
  await rm('.next', { recursive: true, force: true })
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stdout.on('data', (chunk) => { logs += chunk })
  server.stderr.on('data', (chunk) => { logs += chunk })
  const html = await fetchPage()
  const preloadHrefs = [...html.matchAll(/<link\b(?=[^>]*\brel=["']preload["'])(?=[^>]*\bas=["']font["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)].map((match) => match[1])
  const woffPreloads = preloadHrefs.filter((href) => /\.woff(?:\?|$)/i.test(href))
  console.log(JSON.stringify({ preloadHrefs, woffPreloads }))
  process.exitCode = woffPreloads.length > 0 ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopServer()
}
