import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import net from 'node:net'
import { chromium } from 'playwright'

function browserLaunchOptions() {
  const expected = chromium.executablePath()
  if (existsSync(expected)) return { headless: true }
  const cache = join(process.env.PLAYWRIGHT_BROWSERS_PATH || join(process.env.HOME || '/root', '.cache', 'ms-playwright'))
  if (!existsSync(cache)) return { headless: true }
  const candidates = readdirSync(cache).sort().reverse().flatMap(directory => [
    join(cache, directory, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
    join(cache, directory, 'chrome-linux64', 'chrome'),
    join(cache, directory, 'chrome-linux', 'chrome')
  ])
  const executablePath = candidates.find(existsSync)
  return executablePath ? { headless: true, executablePath } : { headless: true }
}

const host = '127.0.0.1'
const server = net.createServer()
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, host, resolve)
})
const address = server.address()
if (!address || typeof address === 'string') throw new Error('Could not allocate a port')
const port = address.port
await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', host, '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})
let logs = ''
child.stdout.on('data', chunk => { logs += chunk.toString() })
child.stderr.on('data', chunk => { logs += chunk.toString() })

let browser
let result = 2
try {
  const baseUrl = `http://${host}:${port}`
  const deadline = Date.now() + 120_000
  while (true) {
    if (child.exitCode !== null) throw new Error(`next dev exited early (${child.exitCode})\n${logs}`)
    try {
      const response = await fetch(`${baseUrl}/page1`)
      if (response.ok) break
    } catch {}
    if (Date.now() > deadline) throw new Error(`Timed out waiting for next dev\n${logs}`)
    await new Promise(resolve => setTimeout(resolve, 250))
  }

  browser = await chromium.launch(browserLaunchOptions())
  const page = await browser.newPage()
  const pageErrors = []
  let actionRequests = 0
  page.on('pageerror', error => pageErrors.push(String(error)))
  page.on('request', request => {
    if (request.method() === 'POST' && request.headers()['next-action']) actionRequests++
  })

  await page.goto(`${baseUrl}/page1`, { waitUntil: 'networkidle' })
  await page.click('#to-page-2')
  await page.waitForURL(url => url.pathname === '/page2', { timeout: 30_000 })
  await page.locator('#action-status').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForFunction(() => document.querySelector('#action-status')?.dataset.status !== 'not-started', null, { timeout: 30_000 })
  await page.waitForTimeout(5_000)

  const status = await page.locator('#action-status').getAttribute('data-status')
  if (pageErrors.length) throw new Error(`Browser runtime error: ${pageErrors.join('; ')}`)
  if (status === 'pending') {
    console.log(`SYMPTOM PRESENT: Server Action Promise remained pending for 5 seconds after router.push (action requests: ${actionRequests}).`)
    result = 0
  } else if (status === 'resolved' || status === 'rejected') {
    console.log(`SYMPTOM ABSENT: Server Action Promise settled as ${status} (action requests: ${actionRequests}).`)
    result = 1
  } else {
    throw new Error(`Unexpected action status: ${status}`)
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error?.stack || error}`)
  if (logs) console.error(logs.slice(-8000))
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  if (child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise(resolve => child.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5_000))
    ])
    if (child.exitCode === null) {
      child.kill('SIGKILL')
      await new Promise(resolve => child.once('exit', resolve))
    }
  }
}
