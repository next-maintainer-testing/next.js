import { spawn } from 'node:child_process'
import http from 'node:http'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const port = 31000 + Math.floor(Math.random() * 1000)
const baseUrl = `http://127.0.0.1:${port}`
let server
let browser

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) return resolve()
        retry()
      })
      request.on('error', retry)
      request.setTimeout(1000, () => request.destroy())
    }
    const retry = () => {
      if (Date.now() >= deadline) return reject(new Error('Next.js server did not become ready'))
      setTimeout(attempt, 250)
    }
    attempt()
  })
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

try {
  server = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname', '127.0.0.1',
    '--port', String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverLog += chunk.toString() })

  await waitForHttp(baseUrl, 60000)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })
  await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 60000 })
  await page.waitForSelector('#home-link')

  const before = await page.evaluate(() => ({
    activeId: document.activeElement?.id || document.activeElement?.tagName || null,
    scrollY: window.scrollY,
  }))
  await page.click('#home-link')

  await page.waitForFunction(
    () => document.activeElement?.id === 'page-content',
    { timeout: 5000 },
  ).catch(() => {})

  const after = await page.evaluate(() => ({
    activeId: document.activeElement?.id || document.activeElement?.tagName || null,
    activeTag: document.activeElement?.tagName || null,
    scrollY: window.scrollY,
    pathname: location.pathname,
  }))
  const symptomPresent = after.activeId === 'page-content' && after.scrollY > before.scrollY

  console.log(JSON.stringify({ before, after, symptomPresent }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopServer(server)
}
