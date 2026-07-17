import { spawn } from 'node:child_process'
import { once } from 'node:events'
import puppeteer from 'puppeteer'

const port = 31034
let server
let browser

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next start exited early with ${server.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`server did not become ready at ${url}`)
}

async function navigate(page, expectedHeading) {
  await page.click('[data-testid="navigate"]')
  await page.waitForFunction(
    (heading) => document.querySelector('h1')?.textContent === heading,
    { timeout: 15_000 },
    expectedHeading,
  )
}

try {
  await run('npm', ['run', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })

  server = spawn('./node_modules/.bin/next', ['start', '-p', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })
  await waitForServer(`http://127.0.0.1:${port}/`)

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="fresh-value"]')
  await page.waitForFunction(
    () => document.documentElement.dataset.cookieAction === 'complete',
    { timeout: 15_000 },
  )

  const first = await page.$eval('[data-testid="fresh-value"]', (node) => node.textContent)
  await navigate(page, 'Test')
  await navigate(page, 'Home')
  const second = await page.$eval('[data-testid="fresh-value"]', (node) => node.textContent)
  await navigate(page, 'Test')
  await navigate(page, 'Home')
  const third = await page.$eval('[data-testid="fresh-value"]', (node) => node.textContent)

  const reportedPattern = second === first && third !== second
  console.log(JSON.stringify({ first, second, third, reportedPattern }))
  console.log(reportedPattern
    ? 'BUG: the second home visit reused the initial value, while the third was fresh'
    : 'OK: the reported stale-second-visit pattern was absent')
  process.exitCode = reportedPattern ? 0 : 1
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await once(server, 'exit').catch(() => {})
    }
  }
}
