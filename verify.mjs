import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer'

const port = 32000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
const output = []
let server
let browser

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function browserExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH
  const root = join(process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer'), 'chrome-headless-shell')
  for (const build of existsSync(root) ? readdirSync(root).filter((name) => name.startsWith('linux-')).sort().reverse() : []) {
    const candidate = join(root, build, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
    if (existsSync(candidate)) return candidate
  }
  throw new Error('The postinstall browser executable is missing')
}

async function waitForServer() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited early with code ${server.exitCode}`)
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for next dev')
}

async function navigateByLink(page, selector, expectedURL) {
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(selector)
  await delay(1200)
  await page.$eval(selector, (link) => link.scrollIntoView({ block: 'center' }))
  await delay(100)
  const preClickScrollY = await page.evaluate(() => window.scrollY)
  await page.$eval(selector, (link) => link.click())
  await page.waitForFunction(
    (url) => window.location.pathname + window.location.hash === url,
    { timeout: 30000 },
    expectedURL,
  )
  await page.waitForSelector('#hoge-page')
  await delay(750)
  return page.evaluate((before) => ({
    preClickScrollY: before,
    scrollY: window.scrollY,
    viewportHeight: window.innerHeight,
    layoutBottom: document.querySelector('#layout-header').getBoundingClientRect().bottom,
    pageTop: document.querySelector('#hoge-page').getBoundingClientRect().top,
    hashTargetExists: Boolean(document.querySelector('#foo')),
    url: window.location.pathname + window.location.hash,
  }), preClickScrollY)
}

let resultCode = 2
try {
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      output.push(chunk.toString())
      if (output.join('').length > 12000) output.shift()
    })
  }

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: browserExecutable(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 600 })

  const withoutHash = await navigateByLink(page, '#without-hash', '/hoge')
  const withMissingHash = await navigateByLink(page, '#with-hash', '/hoge#foo')

  const ordinaryNavigationAtTop = withoutHash.scrollY <= 5
  const missingHashSkippedLayout =
    !withMissingHash.hashTargetExists &&
    withMissingHash.scrollY > 100 &&
    Math.abs(withMissingHash.pageTop) <= 5 &&
    withMissingHash.layoutBottom <= 1

  console.log(JSON.stringify({ ordinaryNavigationAtTop, missingHashSkippedLayout, withoutHash, withMissingHash }))
  resultCode = ordinaryNavigationAtTop && missingHashSkippedLayout ? 0 : 1
} catch (error) {
  console.error(error?.stack || String(error))
  console.error(output.join('').slice(-12000))
  resultCode = 2
}

process.exitCode = resultCode

if (browser) await browser.close().catch(() => {})
if (server && server.exitCode === null) {
  server.kill('SIGTERM')
  await Promise.race([once(server, 'exit'), delay(10000)]).catch(() => {})
  if (server.exitCode === null) server.kill('SIGKILL')
}
