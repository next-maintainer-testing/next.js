import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { request } from 'node:http'
import { chromium } from 'playwright-core'

const host = '127.0.0.1'
const port = 32172
const baseURL = `http://${host}:${port}`
let server
let browser
let serverOutput = ''

function locateChromium() {
  const configured = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  if (configured && existsSync(configured)) return configured

  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    '/root/.cache/ms-playwright',
    `${process.env.HOME || ''}/.cache/ms-playwright`,
  ].filter(Boolean)

  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const directory of readdirSync(root).sort().reverse()) {
      const candidates = [
        `${root}/${directory}/chrome-headless-shell-linux64/chrome-headless-shell`,
        `${root}/${directory}/chrome-linux64/chrome`,
        `${root}/${directory}/chrome-linux/chrome`,
      ]
      for (const candidate of candidates) {
        if (existsSync(candidate)) return candidate
      }
    }
  }
  throw new Error('No Chromium executable is available for the browser reproduction')
}

function waitForServer(timeoutMs = 120000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = request(baseURL, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) return resolve()
        retry()
      })
      req.on('error', retry)
      req.setTimeout(15000, () => req.destroy())
      req.end()
    }
    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for Next.js dev server\n${serverOutput}`))
      } else {
        setTimeout(probe, 250)
      }
    }
    probe()
  })
}

async function inspectForm(page) {
  await page.waitForSelector('#contact-form')
  await page.waitForTimeout(500)
  return page.locator('#contact-form').evaluate((form) => ({
    action: form.getAttribute('action') || '',
    hiddenNames: [...form.querySelectorAll('input[type="hidden"]')].map((input) => input.getAttribute('name') || ''),
    html: form.outerHTML,
  }))
}

let resultCode = 2
try {
  server = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname', host,
    '--port', String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })
  await waitForServer()

  browser = await chromium.launch({
    executablePath: locateChromium(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const linkedPage = await browser.newPage()
  await linkedPage.goto(baseURL, { waitUntil: 'networkidle' })
  await Promise.all([
    linkedPage.waitForURL('**/contact'),
    linkedPage.click('#contact-link'),
  ])
  const linked = await inspectForm(linkedPage)

  const directPage = await browser.newPage()
  await directPage.goto(`${baseURL}/contact`, { waitUntil: 'networkidle' })
  const direct = await inspectForm(directPage)

  const actionError = 'A React form was unexpectedly submitted'
  const linkedIsBroken = linked.action.includes(actionError) &&
    !linked.hiddenNames.some((name) => name.startsWith('$ACTION_'))
  const directIsCorrect = !direct.action.includes(actionError) &&
    direct.hiddenNames.some((name) => name.startsWith('$ACTION_'))
  const reproduced = linkedIsBroken && directIsCorrect

  console.log(JSON.stringify({ reproduced, linked, direct }, null, 2))
  resultCode = reproduced ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  resultCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
        resolve()
      }, 5000)
      server.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  process.exitCode = resultCode
}
