import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before startup (${child.exitCode})\n${logs.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await timeout(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${logs.join('')}`)
}

async function waitForValue(page, selector, expected, timeoutMs) {
  try {
    await page.waitForFunction(
      (target, value) => document.querySelector(target)?.textContent === value,
      { timeout: timeoutMs },
      selector,
      expected
    )
    return true
  } catch (error) {
    if (error?.name === 'TimeoutError') return false
    throw error
  }
}

let browser
let next
let exitCode = 2
try {
  const port = await freePort()
  const logs = []
  next = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  next.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  next.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForServer(baseUrl, next, logs)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: 'shell',
    args: chromium.args
  })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.click('#character-link')
  ])
  await page.goBack({ waitUntil: 'networkidle0' })
  await page.waitForSelector('#sentinel')

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  if (!(await waitForValue(page, '#page-count', '2', 10000))) {
    throw new Error('First infinite-query server action did not resolve after browser back navigation')
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await waitForValue(page, '#fetch-status', 'Fetching next page...', 5000)
  const thirdPageResolved = await waitForValue(page, '#page-count', '3', 5000)
  const pageCount = await page.$eval('#page-count', (node) => node.textContent)
  const status = await page.$eval('#fetch-status', (node) => node.textContent)

  if (!thirdPageResolved && pageCount === '2' && status === 'Fetching next page...') {
    console.log('SYMPTOM_PRESENT: useInfiniteQuery remained fetching on the second server action after browser back')
    exitCode = 0
  } else {
    console.log(`SYMPTOM_ABSENT: the second server action after browser back resolved (pages=${pageCount}, status=${status})`)
    exitCode = 1
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error?.stack || error}`)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  if (next && next.exitCode === null) {
    next.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => next.once('exit', resolve)),
      timeout(5000)
    ])
    if (next.exitCode === null) next.kill('SIGKILL')
  }
}