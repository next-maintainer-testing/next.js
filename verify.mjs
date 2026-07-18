import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 30208
const origin = `http://127.0.0.1:${port}`
let server
let serverExited
let result = 2

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchWithTimeout(url, timeout = 5000) {
  return fetch(url, { signal: AbortSignal.timeout(timeout) })
}

async function waitForPage() {
  const deadline = Date.now() + 90000
  let lastError
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early with code ${server.exitCode}`)
    }
    try {
      const response = await fetchWithTimeout(`${origin}/`)
      if (response.ok) return response
      lastError = new Error(`page returned HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(500)
  }
  throw new Error(`timed out waiting for next dev: ${lastError?.message ?? 'unknown error'}`)
}

async function waitForServerExit(timeout) {
  let timer
  try {
    return await Promise.race([
      serverExited.then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeout) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

function signalServer(signal) {
  try {
    if (process.platform === 'win32') server.kill(signal)
    else process.kill(-server.pid, signal)
  } catch {}
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverExited = once(server, 'exit').catch(() => {})

  let logs = ''
  server.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-12000) })
  server.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-12000) })

  const pageResponse = await waitForPage()
  const html = await pageResponse.text()
  const stylesheetHrefs = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/gi)].map((match) => match[1])
  if (stylesheetHrefs.length === 0) throw new Error('page contained no stylesheet link')

  let referencedMapUrl
  for (const href of stylesheetHrefs) {
    const cssUrl = new URL(href, origin)
    const cssResponse = await fetchWithTimeout(cssUrl)
    if (!cssResponse.ok) throw new Error(`stylesheet returned HTTP ${cssResponse.status}: ${cssUrl}`)
    const css = await cssResponse.text()
    const match = css.match(/[#@]\s*sourceMappingURL\s*=\s*([^\s*]+)\s*\*\//)
    if (match) {
      referencedMapUrl = new URL(match[1].replace(/^['"]|['"]$/g, ''), cssUrl)
      break
    }
  }

  if (!referencedMapUrl) {
    console.log('ABSENT: emitted stylesheets contain no sourceMappingURL for the imported CSS')
    result = 1
  } else {
    const mapResponse = await fetchWithTimeout(referencedMapUrl)
    if (mapResponse.status === 404) {
      console.log(`PRESENT: emitted CSS references missing map ${referencedMapUrl.pathname}; request returned HTTP 404`)
      result = 0
    } else {
      console.log(`ABSENT: referenced map ${referencedMapUrl.pathname} returned HTTP ${mapResponse.status}`)
      result = 1
    }
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack ?? error}`)
  result = 2
} finally {
  process.exitCode = result
  if (server && server.exitCode === null) {
    signalServer('SIGTERM')
    const exited = await waitForServerExit(10000)
    if (!exited && server.exitCode === null) {
      signalServer('SIGKILL')
      await waitForServerExit(5000)
    }
  }
}
