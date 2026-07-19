import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const getPort = () => new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close((error) => error ? reject(error) : resolve(port))
  })
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer(url, child) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(500)
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
}

let browser
let next
process.exitCode = 2

try {
  const port = await getPort()
  const origin = `http://127.0.0.1:${port}`
  next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  let serverOutput = ''
  next.stdout.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000) })
  next.stderr.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000) })

  await waitForServer(origin, next)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'networkidle0' })

  await page.click('[data-testid="load-more"]')
  await page.waitForFunction(() => document.querySelector('[data-testid="item-count"]')?.textContent === '6')
  await page.click('[data-testid="go-to-10"]')
  await page.waitForFunction(() => location.pathname === '/blog/10')

  await page.goBack({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => location.pathname === '/')
  await page.waitForSelector('[data-testid="item-count"]')
  const countAfterBack = await page.$eval('[data-testid="item-count"]', (node) => node.textContent)

  if (countAfterBack === '3') {
    console.log('SYMPTOM_PRESENT: browser Back reset the loaded item count from 6 to 3')
    process.exitCode = 0
  } else if (countAfterBack === '6') {
    console.log('SYMPTOM_ABSENT: browser Back preserved the loaded item count at 6')
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED: unexpected item count after browser Back: ${countAfterBack}\n${serverOutput}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  if (next) await stopChild(next)
}
