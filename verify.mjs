import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import process from 'node:process'
import puppeteer from 'puppeteer'

const cwd = new URL('.', import.meta.url).pathname
const childOutput = []
let server
let browser

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`Timed out: ${command} ${args.join(' ')}\n${output}`))
    }, timeoutMs)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve(output)
      else reject(new Error(`Command failed (${code ?? signal}): ${command} ${args.join(' ')}\n${output}`))
    })
  })
}

function findInstalledBrowser() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH && existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
    return process.env.PUPPETEER_EXECUTABLE_PATH
  }
  const root = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(root)) return undefined
  const directories = readdirSync(root).sort().reverse()
  for (const directory of directories) {
    const candidates = [
      join(root, directory, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      join(root, directory, 'chrome-linux64', 'chrome'),
      join(root, directory, 'chrome-linux', 'chrome'),
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js server exited early (${server.exitCode})\n${childOutput.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Next.js server did not become ready\n${childOutput.join('')}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => server.kill('SIGKILL'), 5000)
    server.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    server.kill('SIGTERM')
  })
}

let result = 2
let observation = ''
try {
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], 180_000)
  const port = await freePort()
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => childOutput.push(String(chunk)))
  server.stderr.on('data', (chunk) => childOutput.push(String(chunk)))

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForServer(baseUrl, 30_000)

  browser = await puppeteer.launch({
    headless: true,
    executablePath: findInstalledBrowser(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error?.stack || error)))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.evaluateOnNewDocument(() => {
    window.__verificationErrors = []
    window.addEventListener('error', (event) => {
      window.__verificationErrors.push(String(event.error?.stack || event.message))
    })
    window.addEventListener('unhandledrejection', (event) => {
      window.__verificationErrors.push(String(event.reason?.stack || event.reason))
    })
  })

  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => {
    const host = document.querySelector('next-route-announcer')
    return Boolean(host?.shadowRoot?.querySelector('#__next-route-announcer__'))
  })
  await page.click('#go')
  await page.waitForFunction(() => location.pathname === '/target')
  await page.waitForFunction(() => {
    const host = document.querySelector('next-route-announcer')
    return host?.shadowRoot?.querySelector('#__next-route-announcer__')?.textContent === 'Target route'
  })

  const mutation = await page.evaluate(() => {
    const announcer = document.querySelector('next-route-announcer')?.shadowRoot?.querySelector('#__next-route-announcer__')
    const original = announcer?.firstChild
    if (!announcer || !original || original.nodeType !== Node.TEXT_NODE) return false
    const translated = document.createElement('font')
    translated.textContent = original.textContent
    announcer.replaceChild(translated, original)
    return announcer.innerHTML
  })
  if (!mutation) throw new Error('Could not apply the browser-translation DOM mutation')

  await page.evaluate(() => history.back())
  await new Promise((resolve) => setTimeout(resolve, 1500))
  const windowErrors = await page.evaluate(() => window.__verificationErrors || []).catch(() => [])
  errors.push(...windowErrors)
  observation = errors.join('\n')
  const reproduced = /NotFoundError/i.test(observation) && /removeChild/i.test(observation) && /not a child/i.test(observation)
  if (reproduced) {
    result = 0
    console.log(`REPRODUCED: ${observation}`)
  } else {
    result = 1
    console.log(`NOT REPRODUCED: no matching removeChild NotFoundError. Browser errors: ${observation || '(none)'}`)
  }
} catch (error) {
  observation = String(error?.stack || error)
  console.error(`CHECK FAILED: ${observation}`)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close().catch(() => {})
  await stopServer().catch(() => {})
}
