import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { chromium } from 'playwright-chromium'

const port = 42000 + (process.pid % 1000)
const baseUrl = `http://127.0.0.1:${port}`
const actionLog = `/tmp/next-79010-actions-${process.pid}.log`
let server
let browser
let output = ''
let result = 2

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function actionCount() {
  try {
    const text = await readFile(actionLog, 'utf8')
    return text.trim() ? text.trim().split('\n').length : 0
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
}

async function waitForServer() {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before readiness (${server.exitCode})\n${output}`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.status < 500) return
    } catch {}
    await delay(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    delay(5000).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }),
  ])
  if (server.exitCode === null) {
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  await rm(actionLog, { force: true })
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ACTION_LOG: actionLog,
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })

  await waitForServer()
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const consoleMessages = []
  page.on('console', (message) => consoleMessages.push(`${message.type()}: ${message.text()}`))
  page.on('pageerror', (error) => consoleMessages.push(`pageerror: ${error.message}`))

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const deadline = Date.now() + 12000
  let calls = 0
  while (Date.now() < deadline) {
    calls = await actionCount()
    if (calls >= 4) break
    const stock = await page.locator('[data-stock]').textContent().catch(() => null)
    if (stock === 'Stock: 7' && calls >= 1) break
    await delay(250)
  }

  calls = await actionCount()
  const body = await page.locator('body').innerText()
  const stockRendered = body.includes('Stock: 7')
  const loadingVisible = body.includes('Loading')
  console.log(JSON.stringify({ calls, stockRendered, loadingVisible, body, consoleMessages }, null, 2))

  if (calls >= 4 && !stockRendered && loadingVisible) {
    result = 0
  } else if (calls <= 2 && stockRendered) {
    result = 1
  } else {
    console.error(`Ambiguous behavior: calls=${calls}, stockRendered=${stockRendered}, loadingVisible=${loadingVisible}\n${output}`)
    result = 2
  }
} catch (error) {
  console.error(error?.stack || error)
  console.error(output)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  await stopServer()
  await rm(actionLog, { force: true })
}
