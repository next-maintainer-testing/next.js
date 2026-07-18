import { spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer'

const port = 23000 + (process.pid % 10000)
const origin = `http://127.0.0.1:${port}`
let server
let browser
let exitCode = 2
let observation = 'verification did not complete'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited with ${server.exitCode}`)
    try {
      const response = await fetch(`${origin}/dashboard`)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('next dev did not become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    sleep(10000).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }),
  ])
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  server.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`))
  server.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`))
  await waitForServer()

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.goto(`${origin}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('[data-view="current-revenue"]', { timeout: 15000 })

  await page.click('[data-view="current-revenue"] a')
  await page.waitForFunction(() => location.pathname === '/dashboard/revenue/archived', { timeout: 10000 })
  await page.waitForSelector('[data-view="archived-revenue"]', { timeout: 10000 })

  await page.click('[data-view="archived-revenue"] a')
  await sleep(700)

  const silentWait = await page.evaluate(() => ({
    pathname: location.pathname,
    archivedVisible: Boolean(document.querySelector('[data-view="archived-revenue"]')),
    currentVisible: Boolean(document.querySelector('[data-view="current-revenue"]')),
    visibleLoaders: [...document.querySelectorAll('[data-loader]')].filter((element) => {
      const style = getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden'
    }).map((element) => element.getAttribute('data-loader')),
  }))

  await page.waitForFunction(() => location.pathname === '/dashboard', { timeout: 12000 })
  await page.waitForSelector('[data-view="current-revenue"]', { timeout: 12000 })
  const eventuallyReturned = await page.$('[data-view="current-revenue"]') !== null
  const reproduced = silentWait.archivedVisible && !silentWait.currentVisible && silentWait.visibleLoaders.length === 0 && eventuallyReturned

  observation = reproduced
    ? `symptom present: 700ms after clicking Back to Dashboard, the stale archived-revenue view remained at ${silentWait.pathname} with no visible loading indicator; the dashboard rendered only after its delayed fetch`
    : `symptom absent: 700ms after clicking back pathname=${silentWait.pathname}, archivedVisible=${silentWait.archivedVisible}, currentVisible=${silentWait.currentVisible}, visibleLoaders=${JSON.stringify(silentWait.visibleLoaders)}, eventuallyReturned=${eventuallyReturned}`
  exitCode = reproduced ? 0 : 1
} catch (error) {
  observation = `check failed: ${error?.stack || error}`
  exitCode = 2
} finally {
  process.exitCode = exitCode
  console.log(observation)
  if (browser) await browser.close().catch(() => {})
  await stopServer().catch((error) => console.error('server cleanup failed', error))
}
