import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = new URL('node_modules/next/dist/bin/next', import.meta.url).pathname
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let server

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal || code !== 0) reject(new Error(`${command} failed (${signal ?? code})`))
      else resolve()
    })
  })
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const stopped = await Promise.race([
    once(server, 'exit').then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ])
  if (!stopped && server.exitCode === null) {
    server.kill('SIGKILL')
    await once(server, 'exit')
  }
}

async function fetchPage(url) {
  let lastError
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw lastError ?? new Error('Server did not become ready')
}

try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
  await run(process.execPath, [nextBin, 'build'])

  const port = 3200 + (process.pid % 1000)
  const origin = `http://127.0.0.1:${port}`
  server = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  server.stdout.on('data', (chunk) => process.stdout.write(chunk))
  server.stderr.on('data', (chunk) => process.stderr.write(chunk))

  const html = await fetchPage(origin)
  const renderedClass = /<h1[^>]*class=["'][^"']*\btext-red-500\b[^"']*["']/.test(html)
  const cssHrefs = [...html.matchAll(/href=["']([^"']+\.css(?:\?[^"']*)?)["']/g)].map((match) => match[1])
  if (!renderedClass) throw new Error('The served MDX heading did not contain text-red-500')
  if (cssHrefs.length === 0) throw new Error('The served page did not reference a stylesheet')

  const stylesheets = await Promise.all(cssHrefs.map(async (href) => {
    const response = await fetch(new URL(href, origin), { signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`Stylesheet ${href} returned HTTP ${response.status}`)
    return response.text()
  }))
  const hasUtilityRule = stylesheets.some((css) => css.includes('.text-red-500{'))

  if (hasUtilityRule) {
    console.log('SYMPTOM_ABSENT: the rendered heading has text-red-500 and the served CSS contains its utility rule')
    process.exitCode = 1
  } else {
    console.log('SYMPTOM_PRESENT: the rendered heading has text-red-500 but the served CSS omits its utility rule')
    process.exitCode = 0
  }
} catch (error) {
  console.error('CHECK_FAILED:', error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stopServer()
}
