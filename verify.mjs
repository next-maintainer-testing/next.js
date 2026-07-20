import { spawn } from 'node:child_process'
import { get } from 'node:http'
import { chromium } from 'playwright'

const host = '127.0.0.1'
const port = 39000 + Math.floor(Math.random() * 1000)
const deadline = Date.now() + 240_000
const children = new Set()

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: new URL('.', import.meta.url),
      env: { ...process.env, ...options.env },
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    children.add(child)
    let output = ''
    if (options.capture) {
      child.stdout.on('data', (chunk) => (output += chunk))
      child.stderr.on('data', (chunk) => (output += chunk))
    }
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      children.delete(child)
      if (code === 0) resolve(output)
      else reject(new Error(`${command} exited with ${code ?? signal}${output ? `\n${output}` : ''}`))
    })
  })
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (Date.now() > deadline) return reject(new Error('Timed out waiting for Next.js server'))
      const request = get(`http://${host}:${port}/`, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) resolve()
        else setTimeout(attempt, 200)
      })
      request.once('error', () => setTimeout(attempt, 200))
      request.setTimeout(1000, () => request.destroy())
    }
    attempt()
  })
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

let server
let browser
let result = 2
try {
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env: { NEXT_TELEMETRY_DISABLED: '1' },
  })

  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', host, '-p', String(port)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'inherit', 'inherit'],
  })
  children.add(server)
  server.once('exit', () => children.delete(server))
  await waitForServer()

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.addInitScript(() => {
    delete globalThis.PerformanceObserver
  })

  const browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle', timeout: 60_000 })
  await page.waitForTimeout(1000)

  const observerType = await page.evaluate(() => typeof globalThis.PerformanceObserver)
  const bodyText = await page.locator('body').innerText()
  const observed = browserErrors.find((message) => /PerformanceObserver is not defined/.test(message))
  const crashed = !bodyText.includes('The page rendered before client analytics initialized.')
  console.log(JSON.stringify({ observerType, browserErrors, crashed, reportedReferenceError: Boolean(observed) }))
  result = observerType === 'undefined' && Boolean(observed) && crashed ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close().catch(() => {})
  await Promise.all([...children].map(stopChild))
}
