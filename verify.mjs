import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const port = 32000 + Math.floor(Math.random() * 1000)
const origin = `http://127.0.0.1:${port}`
let server
let browser
let resultCode = 2

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function chromiumLaunchOptions() {
  const bundled = chromium.executablePath()
  if (existsSync(bundled)) return { headless: true }

  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) return { headless: true }
  const installations = readdirSync(cache)
    .filter((name) => name.startsWith('chromium-'))
    .sort()
    .reverse()
  for (const installation of installations) {
    for (const executable of [
      join(cache, installation, 'chrome-linux64', 'chrome'),
      join(cache, installation, 'chrome-linux', 'chrome'),
    ]) {
      if (existsSync(executable)) return { headless: true, executablePath: executable }
    }
  }
  return { headless: true }
}

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${server.exitCode})`)
    }
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const closed = await Promise.race([
    new Promise((resolve) => server.once('exit', () => resolve(true))),
    delay(5_000).then(() => false),
  ])
  if (!closed && server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd: process.cwd(), env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
  )

  server.stdout.resume()
  server.stderr.resume()

  await waitForServer()
  browser = await chromium.launch(chromiumLaunchOptions())
  const page = await browser.newPage()

  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Search Page' }).waitFor()
  const resultLink = page.getByRole('link', { name: 'item result' })
  await resultLink.waitFor()
  await resultLink.click()
  await page.getByRole('heading', { name: 'Detail Page' }).waitFor()
  await page.locator('main[data-refreshed="true"]').waitFor()

  await page.evaluate(() => window.history.back())
  const urlDeadline = Date.now() + 10_000
  while (new URL(page.url()).pathname !== '/' && Date.now() < urlDeadline) {
    await delay(5)
  }
  if (new URL(page.url()).pathname !== '/') {
    throw new Error(`Back did not update the URL: ${page.url()}`)
  }

  const urlChangedAt = Date.now()
  let heading = await page.locator('h1').textContent()
  while (heading === 'Detail Page' && Date.now() - urlChangedAt < 5_000) {
    await delay(20)
    heading = await page.locator('h1').textContent()
  }
  const staleDurationMs = Date.now() - urlChangedAt
  const symptomPresent = heading === 'Detail Page' || staleDurationMs >= 1_000

  console.log(JSON.stringify({
    symptomPresent,
    urlAfterBack: new URL(page.url()).pathname,
    headingAfterBack: heading,
    staleDetailDurationMs: staleDurationMs,
    criterion: 'URL is / while Detail Page remains visible for at least 1000ms',
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error && error.stack ? error.stack : String(error))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close()
  await stopServer()
}
