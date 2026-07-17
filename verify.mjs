import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'
import puppeteer from 'puppeteer'

const pagePath = new URL('./app/page.js', import.meta.url)
const originalPage = await readFile(pagePath, 'utf8')
let browser = null
let server = null
let result = 2
let details = 'check did not complete'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const listener = net.createServer()
  listener.listen(0, '127.0.0.1')
  await once(listener, 'listening')
  const { port } = listener.address()
  listener.close()
  await once(listener, 'close')
  return port
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`server returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(250)
  }
  throw new Error(`development server did not become ready: ${lastError?.message}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([once(server, 'close'), delay(5000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await once(server, 'close')
  }
}

try {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const output = []
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      output.push(String(chunk))
      if (output.length > 200) output.shift()
    })
  }

  await waitForServer(origin, 90000)
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  const faviconGets = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/favicon.ico') {
      faviconGets.push(Date.now())
    }
  })

  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('#revision', { timeout: 30000 })
  await delay(2000)
  faviconGets.length = 0

  const observations = []
  for (let cycle = 1; cycle <= 6; cycle += 1) {
    const token = `hmr-${cycle}-${Date.now()}`
    const cycleStart = Date.now()
    const edited = originalPage.replace("const revision = 'base'", `const revision = '${token}'`)
    if (edited === originalPage) throw new Error('could not apply the HMR source edit')
    await writeFile(pagePath, edited)
    await page.waitForFunction(
      (expected) => document.querySelector('#revision')?.textContent === expected,
      { timeout: 45000 },
      token,
    )
    const reflectedAt = Date.now()
    await delay(4000)
    const count = faviconGets.filter((time) => time >= cycleStart && time <= reflectedAt + 4000).length
    observations.push(count)
    if (count >= 2) break
  }

  const repeatedAt = observations.findIndex((count) => count >= 2)
  if (repeatedAt >= 0) {
    result = 0
    details = `symptom present: HMR cycle ${repeatedAt + 1} issued ${observations[repeatedAt]} GET /favicon.ico requests; all cycles=${observations.join(',')}`
  } else {
    result = 1
    details = `symptom absent: no HMR cycle issued repeated GET /favicon.ico requests; all cycles=${observations.join(',')}`
  }
} catch (error) {
  details = `check failure: ${error.stack || error}`
  if (server && server.exitCode !== null) details += `\nnext dev exit=${server.exitCode}`
} finally {
  process.exitCode = result
  try {
    await writeFile(pagePath, originalPage)
  } catch (error) {
    console.error(`failed to restore page source: ${error}`)
    process.exitCode = 2
  }
  if (browser) {
    try {
      await browser.close()
    } catch (error) {
      console.error(`failed to close browser: ${error}`)
      process.exitCode = 2
    }
  }
  try {
    await stopServer()
  } catch (error) {
    console.error(`failed to stop development server: ${error}`)
    process.exitCode = 2
  }
  console.log(details)
}
