import { spawn } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import puppeteer from 'puppeteer-core'

const port = 34000 + (process.pid % 10000)
const baseUrl = `http://127.0.0.1:${port}`
let browser
let server
let serverOutput = ''
let outcome = 2

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function executable(path) {
  if (!path) return false
  try {
    await access(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function findBrowser() {
  const direct = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  for (const candidate of direct) if (await executable(candidate)) return candidate

  const roots = [...new Set([
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    `${process.env.HOME || '/root'}/.cache/ms-playwright`,
    '/ms-playwright',
  ].filter(Boolean))]
  const names = new Set(['chrome-headless-shell', 'chrome', 'chromium'])
  async function search(directory, depth) {
    if (depth < 0) return null
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return null
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`
      if (entry.isFile() && names.has(entry.name) && await executable(path)) return path
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const found = await search(`${directory}/${entry.name}`, depth - 1)
      if (found) return found
    }
    return null
  }
  for (const root of roots) {
    const found = await search(root, 4)
    if (found) return found
  }
  throw new Error('No executable Chromium browser was found')
}

async function waitForServer() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await delay(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(10000).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }),
  ])
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-20000)
    })
  }

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: await findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })

  const requestedY = 1400
  await page.evaluate((y) => window.scrollTo(0, y), requestedY)
  await page.waitForFunction((y) => Math.abs(window.scrollY - y) < 10, {}, requestedY)
  const before = await page.evaluate(() => window.scrollY)

  await page.click('#to-page-2')
  await page.waitForFunction(() => location.pathname === '/page2')
  await page.goBack()
  await page.waitForFunction(() => location.pathname === '/')
  await delay(1000)

  const after = await page.evaluate(() => window.scrollY)
  const symptomPresent = after < 300 && before > 1000
  console.log(JSON.stringify({ before, after, symptomPresent }))
  outcome = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || String(error))
  outcome = 2
} finally {
  process.exitCode = outcome
  if (browser) await browser.close().catch((error) => console.error(`Browser cleanup failed: ${error}`))
  await stopServer().catch((error) => console.error(`Server cleanup failed: ${error}`))
}
