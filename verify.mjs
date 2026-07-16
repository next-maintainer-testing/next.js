import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const port = 34649
let server
let browser
let outcome = 2

async function waitForServer(timeout = 30000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/profile/1`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('Next.js server did not become ready')
}

function browserExecutable() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) return undefined
  for (const directory of readdirSync(cache).filter((name) => name.startsWith('chromium-')).sort().reverse()) {
    const executable = join(cache, directory, 'chrome-linux64', 'chrome')
    if (existsSync(executable)) return executable
  }
  return undefined
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  })
  let logs = ''
  server.stdout.on('data', (chunk) => { logs += chunk })
  server.stderr.on('data', (chunk) => { logs += chunk })
  await waitForServer()

  browser = await chromium.launch({ headless: true, executablePath: browserExecutable() })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}/profile/1`)
  await page.waitForSelector('#navigate')

  const started = Date.now()
  await page.click('#navigate')
  let navigatedAt = null
  const deadline = started + 5000
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === '/profile/2') {
      navigatedAt = Date.now()
      break
    }
    await page.waitForTimeout(50)
  }
  if (navigatedAt === null) throw new Error(`Navigation never completed. Server logs:\n${logs}`)

  const elapsed = navigatedAt - started
  console.log(JSON.stringify({ elapsedMs: elapsed, finalUrl: page.url() }))
  // Symptom: router.push is blocked for nearly the full 3-second server action.
  outcome = elapsed >= 2400 ? 0 : 1
} catch (error) {
  console.error(error)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (browser) await browser.close()
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => { server.kill('SIGKILL'); resolve() }, 5000)
      server.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
}
