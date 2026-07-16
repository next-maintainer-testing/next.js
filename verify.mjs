import { spawn } from 'node:child_process'
import { access, readdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

process.exitCode = 2

const port = 32000 + Math.floor(Math.random() * 1000)
const origin = `http://127.0.0.1:${port}`
let server
let browser
let serverOutput = ''

async function findChromium() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  if (configured) {
    await access(configured)
    return configured
  }

  const root = '/root/.cache/ms-playwright'
  for (const product of await readdir(root, { withFileTypes: true })) {
    if (!product.isDirectory() || !product.name.startsWith('chromium-')) continue
    for (const relative of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-headless-shell-linux64/headless_shell']) {
      const candidate = path.join(root, product.name, relative)
      try {
        await access(candidate)
        return candidate
      } catch {}
    }
  }
  throw new Error('No Playwright Chromium executable was found')
}

async function waitForServer() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early (${server.exitCode})\n${serverOutput}`)
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) {
        await response.text()
        return
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const closed = new Promise((resolve) => server.once('close', resolve))
  server.kill('SIGTERM')
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 10_000))])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('close', resolve))
  }
}

try {
  server = spawn(process.execPath, [path.join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-20_000)
    })
  }

  // The readiness request also warms the module-level Emotion cache. A second
  // server render is the state in which the report observes missing SSR CSS.
  await waitForServer()
  await (await fetch(origin, { signal: AbortSignal.timeout(5_000) })).text()

  browser = await chromium.launch({ executablePath: await findChromium(), headless: true })
  const context = await browser.newContext()
  await context.route('**/*', async (route) => {
    if (route.request().resourceType() === 'script') await route.abort()
    else await route.continue()
  })
  const page = await context.newPage()
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  const observed = await page.locator('#emotion-card').evaluate((element) => {
    const card = getComputedStyle(element)
    const body = getComputedStyle(document.body)
    return {
      cardColor: card.color,
      cardPadding: card.paddingTop,
      cardBorder: card.borderTopWidth,
      bodyBackground: body.backgroundColor,
      emotionStyleTags: document.querySelectorAll('style[data-emotion]').length,
    }
  })

  const symptomPresent = observed.cardColor === 'rgb(0, 0, 0)' &&
    observed.cardPadding === '0px' &&
    observed.cardBorder === '0px'
  const symptomAbsent = observed.cardColor === 'rgb(100, 149, 237)' &&
    observed.cardPadding === '48px' &&
    observed.cardBorder === '8px' &&
    observed.bodyBackground === 'rgb(255, 239, 213)'

  console.log(JSON.stringify({ symptomPresent, symptomAbsent, observed }))
  if (!symptomPresent && !symptomAbsent) throw new Error(`Ambiguous computed styles: ${JSON.stringify(observed)}`)
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer()
}
