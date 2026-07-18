import { spawn } from 'node:child_process'
import { once } from 'node:events'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const port = 32187
const origin = `http://127.0.0.1:${port}`
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
let server
let browser
let resultCode = 2

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

async function waitForServer() {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`next dev exited early with ${server.exitCode}`)
    try {
      const response = await fetch(`${origin}/dashboard`)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('next dev did not become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([once(server, 'exit'), sleep(10000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await once(server, 'exit')
  }
}

async function waitForHeading(page, text) {
  await page.waitForFunction((expected) => document.querySelector('h1')?.textContent === expected, { timeout: 10000 }, text)
}

try {
  server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: new URL('.', import.meta.url).pathname,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  server.stdout.on('data', () => {})
  server.stderr.on('data', () => {})

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--no-sandbox'],
  })
  const page = await browser.newPage()
  const client = await page.createCDPSession()
  const requests = new Map()
  const failures = []

  await client.send('Network.enable')
  client.on('Network.requestWillBeSent', (event) => {
    requests.set(event.requestId, event.request.url)
  })
  client.on('Network.loadingFailed', (event) => {
    const url = requests.get(event.requestId) || ''
    if (url.includes('/dashboard') && url.includes('_rsc=')) {
      failures.push({ url, errorText: event.errorText, canceled: event.canceled })
    }
  })

  await page.goto(`${origin}/dashboard`, { waitUntil: 'networkidle0' })
  for (let attempt = 0; attempt < 20 && failures.length === 0; attempt += 1) {
    await page.click('#to-blog')
    await waitForHeading(page, 'Blog')
    await page.click('#to-dashboard')
    await waitForHeading(page, 'Dashboard')
  }
  await sleep(500)

  if (failures.length > 0) {
    console.log(`SYMPTOM PRESENT: Chrome observed failed RSC loading: ${JSON.stringify(failures[0])}`)
    resultCode = 0
  } else {
    console.log('SYMPTOM ABSENT: no failed dashboard/blog RSC request was observed during 20 navigation cycles')
    resultCode = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error?.stack || error}`)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close()
  await stopServer()
}
