import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const port = 34927
const baseUrl = `http://127.0.0.1:${port}`
let server
let browser
let outcome = 2
let output = ''

function stopServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    try { process.kill(-child.pid, 'SIGTERM') } catch { resolve() }
  })
}

async function waitForServer() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready\n${output}`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`)
}

try {
  server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '-p', String(port), '-H', '127.0.0.1'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })

  await waitForServer()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByTestId('result').waitFor()

  await page.evaluate(() => {
    window.__sawIssue49297Loading = false
    const inspect = () => {
      if (document.querySelector('[data-testid="loading"]')) {
        window.__sawIssue49297Loading = true
      }
    }
    inspect()
    window.__issue49297Observer = new MutationObserver(inspect)
    window.__issue49297Observer.observe(document.documentElement, { childList: true, subtree: true })
  })

  await page.getByTestId('page-2').click()
  await page.getByText('Results for page 2', { exact: true }).waitFor({ timeout: 15000 })
  const sawLoading = await page.evaluate(() => {
    window.__issue49297Observer.disconnect()
    return window.__sawIssue49297Loading
  })

  if (sawLoading) {
    console.log('SYMPTOM_ABSENT: loading.js appeared during same-page search-param navigation')
    outcome = 1
  } else {
    console.log('SYMPTOM_PRESENT: destination was delayed but loading.js never appeared during same-page search-param navigation')
    outcome = 0
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  if (output) console.error(output)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (browser) await browser.close()
  await stopServer(server)
}
