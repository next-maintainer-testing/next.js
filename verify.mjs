import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const cwd = new URL('.', import.meta.url).pathname
const port = 34000 + Math.floor(Math.random() * 1000)
let server
let browser
let outcome = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`))
    })
  })
}

function findChromium() {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  if (explicit && existsSync(explicit)) return explicit
  const roots = [process.env.HOME && join(process.env.HOME, '.cache', 'ms-playwright'), '/root/.cache/ms-playwright']
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    const entries = readdirSync(root).filter((name) => name.startsWith('chromium-')).sort().reverse()
    for (const entry of entries) {
      for (const relative of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const candidate = join(root, entry, relative)
        if (existsSync(candidate)) return candidate
      }
    }
  }
  throw new Error('No Chromium executable was found for the browser-level check')
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Next.js server did not become ready at ${url}`)
}

try {
  await run(process.execPath, [join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'])

  server = spawn(
    process.execPath,
    [join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(port)],
    { cwd, stdio: ['ignore', 'pipe', 'pipe'] }
  )
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)
  const serverFailure = new Promise((_, reject) => {
    server.on('error', reject)
    server.on('exit', (code, signal) => reject(new Error(`Next.js server exited early with ${code ?? signal}`)))
  })

  const url = `http://127.0.0.1:${port}`
  await Promise.race([waitForServer(url), serverFailure])

  browser = await chromium.launch({ executablePath: findChromium(), headless: true })
  const context = await browser.newContext()
  await context.addInitScript(() => {
    Promise.allSettled = undefined
  })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)

  const observation = await page.evaluate(() => ({
    effectRan: document.documentElement.dataset.effectRan || null,
    allSettledResult: document.documentElement.dataset.allSettled || null,
    allSettledType: typeof Promise.allSettled,
    supportsModules: 'noModule' in HTMLScriptElement.prototype,
  }))
  const matchingError = pageErrors.find((message) => /allSettled.*(?:not a function|undefined)/i.test(message))

  console.log(JSON.stringify({ observation, pageErrors }, null, 2))
  if (!observation.supportsModules || observation.effectRan !== 'true') {
    throw new Error('The module-capable browser did not reach the application effect')
  }
  if (matchingError && observation.allSettledType === 'undefined' && observation.allSettledResult === null) {
    console.log('REPRODUCED: module-capable browser received no usable Promise.allSettled polyfill and the app failed at runtime')
    outcome = 0
  } else if (observation.allSettledType === 'function' && observation.allSettledResult === 'worked') {
    console.log('NOT REPRODUCED: Promise.allSettled was polyfilled and the app completed')
    outcome = 1
  } else {
    throw new Error('Browser observations were neither the reported symptom nor the expected fixed behavior')
  }
} catch (error) {
  console.error(error.stack || error)
  outcome = 2
} finally {
  process.exitCode = outcome
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
}
