import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import puppeteer from 'puppeteer'

const cwd = new URL('.', import.meta.url).pathname
const port = 32000 + Math.floor(Math.random() * 1000)
const base = `http://127.0.0.1:${port}`
let server
let browser
let serverOutput = ''

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => (output += chunk))
    child.stderr.on('data', (chunk) => (output += chunk))
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out\n${output}`))
    }, timeoutMs)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`${command} exited ${code ?? signal}\n${output}`))
    })
  })
}

async function waitForServer() {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base)
      if (response.ok) return
    } catch {}
    await delay(100)
  }
  throw new Error(`Next.js server did not become ready\n${serverOutput}`)
}

async function waitForRuntimeRegeneration() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (serverOutput.includes('GENERATED post 3:')) return
    await delay(100)
  }
  throw new Error(`The initial stale request did not regenerate the ISR page\n${serverOutput}`)
}

async function clickAndWait(page, selector, pathname) {
  await page.click(selector)
  await page.waitForFunction(
    (expected) => location.pathname === expected,
    { timeout: 10_000 },
    pathname,
  )
  await page.waitForSelector('#generated-at, #post-link', { timeout: 10_000 })
}

async function timestamp(page) {
  return page.$eval('#generated-at', (element) => element.textContent.trim())
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const exited = new Promise((resolve) => server.once('exit', resolve))
  await Promise.race([exited, delay(5_000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await exited
  }
}

try {
  const buildOutput = await run('npm', ['run', 'build'], 180_000)
  console.log(buildOutput)

  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  server.stdout.on('data', (chunk) => {
    serverOutput += chunk
    process.stdout.write(chunk)
  })
  server.stderr.on('data', (chunk) => {
    serverOutput += chunk
    process.stderr.write(chunk)
  })

  await waitForServer()
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto(base, { waitUntil: 'networkidle0' })

  // Link prefetch receives the old ISR payload and starts background regeneration.
  await waitForRuntimeRegeneration()
  await clickAndWait(page, '#post-link', '/blog/3')
  const first = await timestamp(page)

  await clickAndWait(page, '#home-link', '/')
  await delay(2_500)

  await page.goBack({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => location.pathname === '/blog/3')
  await page.waitForSelector('#generated-at')
  const history = await timestamp(page)

  await page.goBack({ waitUntil: 'networkidle0' })
  await page.waitForFunction(() => location.pathname === '/')
  await page.waitForSelector('#post-link')
  await delay(500)
  await clickAndWait(page, '#post-link', '/blog/3')
  const link = await timestamp(page)

  const reproduced = history === first && link !== history
  console.log(JSON.stringify({ first, history, link, reproduced }))
  process.exitCode = reproduced ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer()
}
