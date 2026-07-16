import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium as playwrightChromium } from 'playwright-core'
import chromium from '@sparticuz/chromium'

const port = 32141
let server
let browser
let exitCode = 2

async function waitForPort(timeoutMs = 90000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const connected = await new Promise((resolve) => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => resolve(false))
    })
    if (connected) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Next.js dev server did not become ready')
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })
  await waitForPort()

  browser = await playwrightChromium.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  })
  const page = await browser.newPage()
  const clientErrors = []
  page.on('pageerror', (error) => clientErrors.push(String(error?.stack || error)))
  page.on('console', (message) => {
    if (message.type() === 'error') clientErrors.push(message.text())
  })

  const response = await page.goto(`http://127.0.0.1:${port}/route-that-does-not-exist`, { waitUntil: 'networkidle' })
  if (!response || response.status() !== 404) throw new Error(`Expected initial 404, got ${response?.status()}`)
  await page.locator('#not-found').waitFor()
  await page.locator('#open-photo').click()
  await page.waitForTimeout(3000)

  const body = await page.locator('body').innerText()
  const evidence = [...clientErrors, body].join('\n')
  const symptom = /initialTree is not iterable|Application error: a client-side exception has occurred/i.test(evidence)
  const modalVisible = await page.locator('#photo-modal').isVisible().catch(() => false)

  console.log(JSON.stringify({
    initialStatus: response.status(),
    finalUrl: page.url(),
    symptom,
    modalVisible,
    matchingErrors: clientErrors.filter((text) => /initialTree is not iterable/i.test(text)),
  }, null, 2))
  exitCode = symptom ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close().catch(() => {})
  if (server) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (server.exitCode === null) server.kill('SIGKILL')
  }
}
