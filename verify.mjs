import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import { chromium } from 'playwright'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const nextBin = 'node_modules/next/dist/bin/next'
const maxAttempts = 10

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Timed out waiting for the Next.js server')
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(10_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
}

async function runNavigationAttempt(browser, attempt) {
  await rm('.next', { recursive: true, force: true })
  const port = await availablePort()
  const child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  let page
  child.stdout.on('data', (chunk) => { serverLog += chunk })
  child.stderr.on('data', (chunk) => { serverLog += chunk })

  try {
    const origin = `http://127.0.0.1:${port}`
    await waitForServer(origin, child)
    page = await browser.newPage()
    await page.goto(origin, { waitUntil: 'networkidle' })
    await page.reload({ waitUntil: 'networkidle' })
    const artLink = page.getByRole('link', { name: 'Open art page' })
    await artLink.hover()
    await sleep(1000)
    await artLink.click()

    let wrongParentLoadingObserved = false
    let expectedNestedLoadingObserved = false
    const deadline = Date.now() + 15_000
    while (Date.now() < deadline) {
      const body = await page.locator('body').innerText()
      wrongParentLoadingObserved ||= body.includes('Loading artist page...')
      expectedNestedLoadingObserved ||= body.includes('Loading art page...')
      if (body.includes('picasso: guernica')) break
      await sleep(50)
    }

    const finalBody = await page.locator('body').innerText()
    if (!finalBody.includes('picasso: guernica')) {
      throw new Error(`Attempt ${attempt} did not finish rendering the art page. Server output:\n${serverLog.slice(-4000)}`)
    }
    if (!wrongParentLoadingObserved && !expectedNestedLoadingObserved) {
      throw new Error(`Attempt ${attempt} exposed neither loading boundary.`)
    }
    return { wrongParentLoadingObserved, expectedNestedLoadingObserved }
  } finally {
    if (page) await page.close()
    await stopServer(child)
  }
}

let browser
let result = 2

try {
  browser = await chromium.launch({ headless: true })
  result = 1
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const observation = await runNavigationAttempt(browser, attempt)
    if (observation.wrongParentLoadingObserved) {
      console.log(`SYMPTOM PRESENT: attempt ${attempt} rendered "Loading artist page..." instead of the nested art loading UI.`)
      result = 0
      break
    }
    console.log(`Attempt ${attempt}: rendered the expected nested art loading UI.`)
  }
  if (result === 1) {
    console.log(`SYMPTOM ABSENT: all ${maxAttempts} clean navigation attempts rendered the expected "Loading art page..." UI.`)
  }
} catch (error) {
  console.error('CHECK FAILED:', error?.stack || error)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close()
}
