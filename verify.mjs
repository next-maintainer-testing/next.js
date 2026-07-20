import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer'

const port = 3200 + (process.pid % 1000)
const baseUrl = `http://127.0.0.1:${port}`
let server
let browser

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  let lastError
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Next.js did not become ready: ${lastError}`)
}

async function cleanup() {
  if (browser) {
    await browser.close().catch(() => {})
    browser = undefined
  }
  if (server && server.exitCode === null) {
    try {
      process.kill(-server.pid, 'SIGTERM')
    } catch {}
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      sleep(5000),
    ])
    if (server.exitCode === null) {
      try {
        process.kill(-server.pid, 'SIGKILL')
      } catch {}
      await new Promise((resolve) => server.once('exit', resolve))
    }
  }
}

try {
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString() })

  await waitForServer()
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('#result')?.getAttribute('data-ready') === 'true', { timeout: 60000 })
  const text = await page.$eval('#result', (element) => element.textContent || '')
  let result
  try {
    result = JSON.parse(text)
  } catch {
    throw new Error(`Worker failed to return structured output: ${text}; server log: ${serverLog.slice(-2000)}`)
  }

  const symptomPresent = result.typeofWindow === 'object'
  console.log(JSON.stringify({ symptomPresent, ...result }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await cleanup()
}
