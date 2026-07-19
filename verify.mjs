import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer'

const port = 32181
const origin = `http://localhost:${port}`
let server
let browser
let page
let output = ''

function append(chunk) {
  output += chunk.toString()
  if (output.length > 12000) output = output.slice(-12000)
}

async function waitForServer() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${output}`)
    }
    try {
      const response = await fetch(`${origin}/login`, { redirect: 'manual' })
      if (response.status >= 200 && response.status < 400) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for Next.js\n${output}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  server = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    'localhost',
    '--port',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', append)
  server.stderr.on('data', append)

  await waitForServer()

  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  page = await browser.newPage()
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle0', timeout: 90000 })

  const initialPath = new URL(page.url()).pathname
  if (initialPath !== '/en/login') {
    throw new Error(`Precondition failed: direct /login navigation ended at ${initialPath}`)
  }
  if (!(await page.$('#login-page')) || !(await page.$('#submit'))) {
    throw new Error('Precondition failed: login page or submit button was not rendered')
  }

  const actionResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && Boolean(response.request().headers()['next-action']),
    { timeout: 60000 },
  )
  await page.click('#submit')
  const actionResponse = await actionResponsePromise
  if (actionResponse.status() >= 400) {
    throw new Error(`Server action failed with HTTP ${actionResponse.status()}`)
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))

  const finalPath = new URL(page.url()).pathname
  if (!(await page.$('#login-page'))) {
    throw new Error(`Postcondition failed: login page was not rendered after the action (URL ${finalPath})`)
  }

  if (finalPath === '/login') {
    console.log('REPRODUCED: after the server action redirect, the rendered login page has browser path /login instead of /en/login')
    process.exitCode = 0
  } else if (finalPath === '/en/login') {
    console.log('NOT REPRODUCED: after the server action redirect, the browser path is /en/login')
    process.exitCode = 1
  } else {
    throw new Error(`Unexpected browser path after the server action: ${finalPath}`)
  }
} catch (error) {
  let pageState = ''
  try {
    if (page) pageState = `\nBrowser URL: ${page.url()}\nBrowser HTML: ${(await page.content()).slice(0, 4000)}`
  } catch {}
  console.error(`${error?.stack || error}${pageState}\nNext.js output:\n${output}`)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer()
}
