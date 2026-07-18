import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import net from 'node:net'
import { chromium } from 'playwright-core'

function findBrowser(root = '/root/.cache/ms-playwright') {
  const preferred = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean)
  for (const candidate of preferred) {
    if (existsSync(candidate)) return candidate
  }

  if (!existsSync(root)) return null
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('chromium-')) continue
    const candidate = `${root}/${entry.name}/chrome-linux64/chrome`
    if (existsSync(candidate)) return candidate
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('chromium_headless_shell-')) continue
    const candidate = `${root}/${entry.name}/chrome-headless-shell-linux64/chrome-headless-shell`
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url, server, logs) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${server.exitCode})\n${logs.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for Next.js\n${logs.join('')}`)
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

let browser
let server
let resultCode = 2
const logs = []

try {
  const executablePath = findBrowser()
  if (!executablePath) throw new Error('No Chromium executable is available')

  const port = await freePort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  server.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  await waitForServer(baseUrl, server, logs)
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/?filter=one`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('card').waitFor({ state: 'visible', timeout: 15_000 })
  const initialCard = await page.getByTestId('card').textContent()
  if (!initialCard?.includes('one')) throw new Error(`Unexpected initial card: ${initialCard}`)

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 1500,
    downloadThroughput: 200_000,
    uploadThroughput: 100_000,
    connectionType: 'cellular3g',
  })

  const clickedAt = Date.now()
  await page.getByTestId('filter').evaluate((button) => button.click())
  await page.waitForTimeout(850)
  const oldCardStillVisible = await page.getByTestId('card').isVisible().catch(() => false)
  const staleCardText = oldCardStillVisible ? await page.getByTestId('card').textContent() : null

  await page.getByTestId('fallback').waitFor({ state: 'visible', timeout: 10_000 })
  const fallbackDelayMs = Date.now() - clickedAt
  await page.getByTestId('card').waitFor({ state: 'visible', timeout: 12_000 })
  const finalCard = await page.getByTestId('card').textContent()

  const symptomPresent =
    oldCardStillVisible &&
    staleCardText?.includes('one') &&
    fallbackDelayMs >= 800 &&
    finalCard?.includes('two')

  console.log(JSON.stringify({
    symptom: symptomPresent ? 'present' : 'absent',
    oldCardStillVisibleAt850ms: oldCardStillVisible,
    staleCardText,
    fallbackDelayMs,
    finalCard,
    finalUrl: page.url(),
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  if (logs.length) console.error(logs.join('').slice(-5000))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close()
  await stopServer(server)
}
