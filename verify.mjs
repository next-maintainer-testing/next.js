import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(url, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  const exited = new Promise((resolve) => server.once('exit', resolve))
  const deadline = sleep(5000).then(() => 'timeout')
  if (await Promise.race([exited.then(() => 'exited'), deadline]) === 'timeout') {
    server.kill('SIGKILL')
    await exited
  }
}

const port = await availablePort()
const origin = `http://127.0.0.1:${port}`
const server = spawn(process.execPath, [
  'node_modules/next/dist/bin/next',
  'dev',
  '--hostname',
  '127.0.0.1',
  '--port',
  String(port)
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
})

let serverOutput = ''
server.stdout.on('data', (chunk) => { serverOutput += chunk })
server.stderr.on('data', (chunk) => { serverOutput += chunk })

let browser
let exitCode = 2

try {
  await waitForServer(origin)
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: 'shell'
  })

  const baselinePage = await browser.newPage()
  await baselinePage.goto(`${origin}/direct`, { waitUntil: 'networkidle0', timeout: 60000 })
  await baselinePage.waitForSelector('#direct-child', { timeout: 30000 })
  await sleep(500)
  const baselineRenders = await baselinePage.evaluate(() => window.__directParentRenders || 0)
  await baselinePage.close()

  const dynamicPage = await browser.newPage()
  await dynamicPage.goto(origin, { waitUntil: 'networkidle0', timeout: 60000 })
  await dynamicPage.waitForSelector('#dynamic-child', { timeout: 30000 })
  await sleep(500)
  const dynamicRenders = await dynamicPage.evaluate(() => window.__dynamicParentRenders || 0)
  await dynamicPage.close()

  const symptomPresent = baselineRenders > 0 && dynamicRenders > baselineRenders
  console.log(JSON.stringify({ baselineRenders, dynamicRenders, symptomPresent }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  if (serverOutput) console.error(serverOutput.slice(-8000))
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  await stopServer(server)
}
