import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const host = '127.0.0.1'
const port = await new Promise((resolve, reject) => {
  const socket = createServer()
  socket.once('error', reject)
  socket.listen(0, host, () => {
    const address = socket.address()
    socket.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const server = spawn(process.execPath, [nextBin, 'dev', '-H', host, '-p', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
for (const stream of [server.stdout, server.stderr]) {
  stream.on('data', (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-12000)
  })
}

let browser
let outcome = 2
let observation = ''

async function waitForServer() {
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await fetch(`http://${host}:${port}/`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${serverOutput}`)
}

try {
  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: 'shell',
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle0' })
  await page.click('#masked-link')
  await page.waitForFunction(() => {
    return document.querySelector('#href-route, #as-route') !== null
  }, { timeout: 60000 })

  const result = await page.evaluate(() => ({
    pathname: location.pathname,
    search: location.search,
    hrefRoute: document.querySelector('#href-route')?.textContent ?? null,
    asRoute: document.querySelector('#as-route')?.textContent ?? null,
  }))
  observation = JSON.stringify(result)

  const maskedAddress = result.pathname === '/test/1' && result.search === ''
  const bugPresent = maskedAddress && result.asRoute !== null && result.hrefRoute === null
  const correctBehavior = maskedAddress && result.hrefRoute?.includes('id=1') && result.asRoute === null

  if (bugPresent) {
    outcome = 0
    console.log(`BUG PRESENT: middleware resolved the Link to the as route: ${observation}`)
  } else if (correctBehavior) {
    outcome = 1
    console.log(`BUG ABSENT: href route rendered under the masked URL: ${observation}`)
  } else {
    throw new Error(`Unexpected navigation result: ${observation}`)
  }
} catch (error) {
  console.error(error?.stack || error)
  if (serverOutput) console.error(`Next.js output:\n${serverOutput}`)
  outcome = 2
} finally {
  process.exitCode = outcome
  if (browser) await browser.close()
  if (server.exitCode === null) {
    if (process.platform === 'win32') server.kill('SIGTERM')
    else process.kill(-server.pid, 'SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
  }
  if (server.exitCode === null) {
    if (process.platform === 'win32') server.kill('SIGKILL')
    else process.kill(-server.pid, 'SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}
