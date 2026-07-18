import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import process from 'node:process'
import { Browser, computeExecutablePath, detectBrowserPlatform } from '@puppeteer/browsers'
import puppeteer from 'puppeteer'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/internal/revisions.js'

const port = 32000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
const browserExecutable = computeExecutablePath({
  cacheDir: puppeteer.configuration.cacheDirectory,
  browser: Browser.CHROMEHEADLESSSHELL,
  buildId: PUPPETEER_REVISIONS['chrome-headless-shell'],
  platform: detectBrowserPlatform(),
})
let server
let browser
let resultCode = 2
let observation = 'check did not complete'
let serverOutput = ''

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${serverOutput.slice(-4000)}`)
    }
    try {
      const response = await fetch(origin, { redirect: 'manual' })
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${serverOutput.slice(-4000)}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {}
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
  if (server.exitCode === null) {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {}
    await once(server, 'exit').catch(() => {})
  }
}

try {
  server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput += chunk.toString()
      if (serverOutput.length > 100_000) serverOutput = serverOutput.slice(-100_000)
    })
  }

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: browserExecutable,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  const consoleMessages = []
  const pageErrors = []
  page.on('console', (message) => consoleMessages.push(message.text()))
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message))
  await page.evaluateOnNewDocument(() => {
    window.localStorage.setItem('show-extra', 'yes')
  })
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 90_000 })
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const clientOnlyRendered = await page.$('#client-only') !== null
  const allDiagnostics = [...consoleMessages, ...pageErrors].join('\n')
  const hasHydrationDiagnostic = /Expected server HTML|Hydration failed|hydration error|did not match|server rendered HTML/i.test(allDiagnostics)
  const pointsToCulprit = /pages[\\/]index\.js:3(?::|\b)|[> ]3\s*\|\s*const showExtra/.test(allDiagnostics)

  if (!clientOnlyRendered || !hasHydrationDiagnostic) {
    resultCode = 2
    observation = `check failed: mismatch did not produce the expected hydrated DOM and diagnostic; DOM=${clientOnlyRendered}; diagnostics=${JSON.stringify(allDiagnostics.slice(0, 3000))}`
  } else if (pointsToCulprit) {
    resultCode = 1
    observation = `symptom absent: hydration diagnostic identifies the localStorage expression at pages/index.js:3; diagnostics=${JSON.stringify(allDiagnostics.slice(0, 3000))}`
  } else {
    resultCode = 0
    observation = `symptom present: hydration mismatch is reported, but the diagnostic omits the localStorage culprit at pages/index.js:3; diagnostics=${JSON.stringify(allDiagnostics.slice(0, 3000))}`
  }
} catch (error) {
  resultCode = 2
  observation = `check failed: ${error.stack || error.message}`
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close().catch(() => {})
  await stopServer().catch(() => {})
  console.log(observation)
}
