import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const port = 32000 + Math.floor(Math.random() * 1000)
const baseUrl = `http://127.0.0.1:${port}`
let server
let browser
let result = 2

function findBrowser() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || '/root/.cache/ms-playwright'
  if (existsSync(cache)) {
    for (const directory of readdirSync(cache).sort().reverse()) {
      candidates.push(
        join(cache, directory, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
        join(cache, directory, 'chrome-linux64', 'chrome')
      )
    }
  }
  return candidates.find((candidate) => candidate && existsSync(candidate))
}

async function waitForServer(timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for the Next.js server')
}

async function navigateByLink(page, href) {
  await page.click(`a[href="${href}"]`)
  await page.waitForFunction((path) => location.pathname === path, {}, href)
}

try {
  server = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '-H',
    '127.0.0.1',
    '-p',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverLog = ''
  const collect = (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-12000)
  }
  server.stdout.on('data', collect)
  server.stderr.on('data', collect)

  await waitForServer()
  const executablePath = findBrowser()
  if (!executablePath) throw new Error('No Chromium executable is available')
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() =>
    window.__scriptRuns?.['home-with-id'] === 1 &&
    window.__scriptRuns?.['home-without-id'] === 1
  )

  await navigateByLink(page, '/other')
  await page.waitForFunction(() =>
    window.__scriptRuns?.['other-with-id'] === 1 &&
    window.__scriptRuns?.['other-without-id'] === 1
  )

  await navigateByLink(page, '/')
  await page.waitForFunction(() => window.__scriptRuns?.['home-without-id'] === 2)
  const observed = await page.evaluate(() => ({ ...window.__scriptRuns }))

  const symptomPresent =
    observed['home-with-id'] === 1 &&
    observed['home-without-id'] === 2 &&
    observed['other-with-id'] === 1 &&
    observed['other-without-id'] === 1

  const symptomAbsent =
    observed['home-with-id'] === 2 &&
    observed['home-without-id'] === 2

  console.log(JSON.stringify({ observed, symptomPresent }, null, 2))
  if (symptomPresent) result = 0
  else if (symptomAbsent) result = 1
  else throw new Error(`Unexpected execution counts: ${JSON.stringify(observed)}`)
} catch (error) {
  console.error(error?.stack || error)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    const exited = once(server, 'exit')
    const timer = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }, 5000)
    await exited
    clearTimeout(timer)
  }
}
