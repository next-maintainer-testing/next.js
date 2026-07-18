import { spawn } from 'node:child_process'
import { chromium } from 'playwright-core'

const port = 32144
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [
  './node_modules/next/dist/bin/next',
  'dev',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    serverOutput += chunk.toString()
    if (serverOutput.length > 100000) serverOutput = serverOutput.slice(-100000)
  })
}

let browser
let outcome = 2
let detail = 'verification did not complete'
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

try {
  const deadline = Date.now() + 90000
  let ready = false
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited early (${server.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await fetch(origin)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await delay(250)
  }
  if (!ready) throw new Error(`Timed out waiting for Next.js\n${serverOutput}`)

  const executablePath = process.env.CHROMIUM_PATH || '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
  browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  await page.goto(origin, { waitUntil: 'networkidle', timeout: 90000 })
  await page.locator('#ready').waitFor({ timeout: 30000 })
  await delay(1500)

  const diagnostics = [...consoleErrors, ...pageErrors]
  const hydrationErrors = diagnostics.filter((text) =>
    /hydration failed|hydration error|hydrated but some attributes|server rendered html didn't match|did not match/i.test(text)
  )

  if (hydrationErrors.length > 0) {
    outcome = 0
    detail = `Hydration error observed in browser console:\n${hydrationErrors.join('\n---\n')}`
  } else {
    outcome = 1
    detail = `No hydration error observed. Browser diagnostics:\n${diagnostics.join('\n---\n') || '(none)'}`
  }
} catch (error) {
  outcome = 2
  detail = error?.stack || String(error)
} finally {
  process.exitCode = outcome
  console.log(detail)
  if (browser) await browser.close().catch(() => {})
  if (server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      delay(5000).then(() => server.kill('SIGKILL')),
    ])
  }
}
