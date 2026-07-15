import { spawn } from 'node:child_process'
import net from 'node:net'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Next.js did not become ready within 30 seconds')
}

async function waitForPage(page, pathname, pageName) {
  await page.waitForFunction((expectedPath, expectedPage) => (
    location.pathname === expectedPath &&
    document.querySelector(`[data-page="${expectedPage}"]`)
  ), {}, pathname, pageName)
}

let server
let browser
let exitCode = 2
const serverOutput = []

try {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '-H',
    '127.0.0.1',
    '-p',
    String(port),
  ], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  server.stdout.on('data', (chunk) => serverOutput.push(chunk.toString()))
  server.stderr.on('data', (chunk) => serverOutput.push(chunk.toString()))
  await waitForServer(port, server)

  browser = await puppeteer.launch({
    headless: true,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  const client = await page.createCDPSession()
  await client.send('Network.enable')

  await page.goto(`${origin}/`, { waitUntil: 'networkidle0' })
  await page.waitForSelector('[data-page="home"][data-hydrated="true"]')
  const sentinel = `sentinel-${Date.now()}-${Math.random()}`
  await page.evaluate((value) => { window.__navigationSentinel = value }, sentinel)

  // Visit the target once, return, then observe whether revisiting it downloads
  // another route response instead of using the client router's visited cache.
  await page.click('#target-link')
  await waitForPage(page, '/target', 'target')
  await page.click('#home-link')
  await waitForPage(page, '/', 'home')
  await page.waitForSelector('[data-page="home"][data-hydrated="true"]')

  const revisitRequests = []
  const onRequest = (event) => {
    const url = new URL(event.request.url)
    if (url.pathname === '/target') {
      revisitRequests.push({ type: event.type, url: event.request.url })
    }
  }
  client.on('Network.requestWillBeSent', onRequest)
  await page.click('#target-link')
  await waitForPage(page, '/target', 'target')
  await sleep(300)
  client.off('Network.requestWillBeSent', onRequest)

  const retainedSentinel = await page.evaluate(() => window.__navigationSentinel ?? null)
  const payloadRequests = revisitRequests.filter(({ type, url }) => (
    type === 'Fetch' && new URL(url).searchParams.has('_rsc')
  ))
  const documentRequests = revisitRequests.filter(({ type }) => type === 'Document')
  const symptomPresent = payloadRequests.length > 0 || documentRequests.length > 0
  const observation = {
    pathname: new URL(page.url()).pathname,
    retainedWindowState: retainedSentinel === sentinel,
    revisitPayloadRequests: payloadRequests.length,
    revisitDocumentRequests: documentRequests.length,
  }
  console.log(JSON.stringify({ symptomPresent, observation }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  if (serverOutput.length) console.error(serverOutput.join('').slice(-8000))
  exitCode = 2
} finally {
  // Persist the result before closing the final referenced handles.
  process.exitCode = exitCode
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      sleep(5000).then(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }),
    ])
  }
}
