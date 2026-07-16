import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const port = 32148
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port), '-H', '127.0.0.1'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
})
let output = ''
server.stdout.on('data', chunk => { output += chunk })
server.stderr.on('data', chunk => { output += chunk })

function installedChromium() {
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) return undefined
  const revisions = readdirSync(cache).filter(name => name.startsWith('chromium_headless_shell-')).sort().reverse()
  for (const revision of revisions) {
    const candidates = [
      join(cache, revision, 'chrome-headless-shell-linux64', 'chrome-headless-shell'),
      join(cache, revision, 'chrome-linux', 'headless_shell')
    ]
    for (const candidate of candidates) if (existsSync(candidate)) return candidate
  }
}

let browser
let exitCode = 2
try {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early (${server.exitCode})\n${output}`)
    try {
      const response = await fetch(origin)
      if (response.ok) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (Date.now() >= deadline) throw new Error(`Timed out waiting for Next.js\n${output}`)

  browser = await chromium.launch({ headless: true, executablePath: installedChromium() })
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  await page.goto(`${origin}/#request-memoization`)
  await page.locator('#fetch-link').click()
  await page.waitForURL('**/fetching')
  await page.waitForTimeout(1250)
  await page.locator('#reference-link').scrollIntoViewIfNeeded()
  const expectedY = await page.evaluate(() => window.scrollY)
  if (expectedY < 1000) throw new Error(`Precondition failed: expected a deep scroll position, got ${expectedY}`)
  await page.locator('#reference-link').click()
  await page.waitForURL('**/reference')
  await page.goBack({ waitUntil: 'networkidle' })
  await page.waitForURL('**/fetching')
  await page.waitForTimeout(1500)
  const actualY = await page.evaluate(() => window.scrollY)
  const symptomPresent = Math.abs(actualY - expectedY) > 150
  console.log(JSON.stringify({ expectedY, actualY, symptomPresent }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(output)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  server.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000))
  ])
  if (server.exitCode === null) server.kill('SIGKILL')
}
