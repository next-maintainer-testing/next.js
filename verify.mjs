import { spawn } from 'node:child_process'
import net from 'node:net'
import puppeteer from 'puppeteer'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(port, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/page1`)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Next.js did not become ready within 30 seconds')
}

async function runRace(page, origin) {
  await page.goto(`${origin}/page1`, { waitUntil: 'networkidle0' })
  await page.click('#to-page-2')
  await page.waitForFunction(() => (
    location.pathname === '/page2' &&
    document.querySelector('[data-page]')?.dataset.page === 'page2'
  ))

  const client = await page.createCDPSession()
  await client.send('Network.setCacheDisabled', { cacheDisabled: true })
  const history = await client.send('Page.getNavigationHistory')
  const page1Entry = history.entries
    .slice(0, history.currentIndex)
    .reverse()
    .find((entry) => new URL(entry.url).pathname === '/page1')
  if (!page1Entry) throw new Error('The expected /page1 browser history entry was not created')

  const pausedRequestIds = new Set()
  let releaseRequests = false
  let resolveFirstPaused
  const firstPaused = new Promise((resolve) => { resolveFirstPaused = resolve })
  const onPaused = (event) => {
    if (releaseRequests) {
      client.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {})
      return
    }
    pausedRequestIds.add(event.requestId)
    resolveFirstPaused()
  }
  client.on('Fetch.requestPaused', onPaused)

  await client.send('Fetch.enable', {
    patterns: [{ resourceType: 'Script', requestStage: 'Request' }],
  })
  await client.send('Page.reload')
  await Promise.race([
    firstPaused,
    sleep(10_000).then(() => { throw new Error('Reload did not reach a paused Next.js script request') }),
  ])

  // The reloaded /page2 document has committed, but its router has not hydrated.
  // Going back now deterministically widens the same reload/back timing window.
  await client.send('Page.navigateToHistoryEntry', { entryId: page1Entry.id })
  releaseRequests = true
  for (const requestId of pausedRequestIds) {
    await client.send('Fetch.continueRequest', { requestId }).catch(() => {})
  }
  await sleep(500)
  await client.send('Fetch.disable').catch(() => {})
  client.off('Fetch.requestPaused', onPaused)
  await sleep(1500)

  return page.evaluate(() => ({
    pathname: location.pathname,
    renderedPage: document.querySelector('[data-page]')?.dataset.page ?? null,
  }))
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
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  let symptomPresent = false
  const observations = []
  for (let attempt = 1; attempt <= 3 && !symptomPresent; attempt++) {
    const page = await browser.newPage()
    try {
      const observation = await runRace(page, origin)
      observations.push(observation)
      symptomPresent = observation.pathname === '/page1' && observation.renderedPage === 'page2'
    } finally {
      await page.close().catch(() => {})
    }
  }

  console.log(JSON.stringify({ symptomPresent, observations }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(`Verification failed: ${error.stack || error}`)
  if (serverOutput.length) console.error(serverOutput.join('').slice(-8000))
  exitCode = 2
} finally {
  // Set the durable result before releasing the final browser/server handles.
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
