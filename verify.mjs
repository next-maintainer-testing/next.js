import { spawn } from 'node:child_process'
import process from 'node:process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const port = 34728
const origin = `http://127.0.0.1:${port}`
const warningFragment = 'has either width or height modified, but not the other'
let server
let browser
let serverLog = ''

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${serverLog}`)
}

async function stopServer() {
  if (!server) return
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  await sleep(1_000)
  try {
    process.kill(-server.pid, 'SIGKILL')
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
  if (server.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      sleep(5_000),
    ])
  }
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString() })

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  const messages = []
  page.on('console', (message) => messages.push(message.text()))
  page.on('pageerror', (error) => messages.push(`PAGE ERROR: ${error.message}`))

  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 120_000 })
  await page.waitForSelector('body[data-hydrated="true"]', { timeout: 30_000 })
  await page.waitForFunction(() => {
    const image = document.querySelector('img')
    return image && image.complete && image.naturalWidth > 0
  }, { timeout: 30_000 })
  await sleep(1_000)

  const warning = messages.find((message) => message.includes(warningFragment))
  if (warning) {
    process.exitCode = 0
    console.log(`SYMPTOM PRESENT: ${warning}`)
  } else {
    process.exitCode = 1
    console.log('SYMPTOM ABSENT: fractional width and height produced no aspect-ratio warning')
  }
} catch (error) {
  process.exitCode = 2
  console.error(`CHECK FAILED: ${error.stack || error}`)
} finally {
  if (browser) await browser.close()
  await stopServer()
}
