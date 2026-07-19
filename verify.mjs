import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { chromium as playwrightChromium } from 'playwright-core'
import serverlessChromium from '@sparticuz/chromium'
import { join } from 'node:path'

const cwd = process.cwd()
let nextProcess
let browser
let outcome = 2
let observation = 'verification did not complete'

async function openPort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('timed out waiting for Next.js')
}

try {
  const port = await openPort()
  const origin = `http://127.0.0.1:${port}`
  nextProcess = spawn(join(cwd, 'node_modules', '.bin', 'next'), ['dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  nextProcess.stdout.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-12_000) })
  nextProcess.stderr.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-12_000) })
  await waitForServer(origin, nextProcess)

  browser = await playwrightChromium.launch({
    executablePath: await serverlessChromium.executablePath(),
    headless: true,
    args: serverlessChromium.args,
  })
  const page = await browser.newPage()
  const browserErrors = []
  page.on('pageerror', (error) => browserErrors.push(String(error)))

  const seed = `seed-${Date.now()}`
  const first = `first-${Date.now()}`
  const second = `second-${Date.now()}`
  const seeded = await fetch(`${origin}/api/dynamic/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: seed }),
  })
  if (!seeded.ok) throw new Error(`seed request failed with ${seeded.status}`)

  await page.goto(`${origin}/dynamic`, { waitUntil: 'networkidle' })
  const input = page.locator('input[name="name"]')
  await input.waitFor()
  if (await input.inputValue() !== seed) throw new Error('hard navigation did not render seeded file data')

  await input.fill(first)
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/dynamic') && response.request().method() === 'POST'),
    page.locator('button[type="submit"]').click(),
  ])
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('link', { name: 'Dynamic' }).click()
  await input.waitFor()
  const firstReturn = await input.inputValue()
  if (firstReturn !== first) throw new Error(`first Link return was ${JSON.stringify(firstReturn)}, expected ${JSON.stringify(first)}`)

  await input.fill(second)
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/dynamic') && response.request().method() === 'POST'),
    page.locator('button[type="submit"]').click(),
  ])
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('link', { name: 'Dynamic' }).click()
  await input.waitFor()
  const secondReturn = await input.inputValue()

  if (secondReturn === first) {
    outcome = 0
    observation = `symptom present: after saving ${JSON.stringify(second)}, the second Link return remained stale at ${JSON.stringify(first)}`
  } else if (secondReturn === second) {
    outcome = 1
    observation = `symptom absent: the second Link return rendered newly saved ${JSON.stringify(second)}`
  } else {
    throw new Error(`unexpected second Link value ${JSON.stringify(secondReturn)}; browser errors: ${browserErrors.join('; ')}; server log: ${serverLog}`)
  }
} catch (error) {
  outcome = 2
  observation = `check failed: ${error?.stack || error}`
} finally {
  process.exitCode = outcome
  console.log(observation)
  if (browser) await browser.close().catch(() => {})
  if (nextProcess && nextProcess.exitCode === null) {
    nextProcess.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (nextProcess.exitCode === null) nextProcess.kill('SIGKILL')
        resolve()
      }, 5_000)
      nextProcess.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
