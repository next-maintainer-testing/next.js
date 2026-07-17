import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const warningText = 'has either width or height modified, but not the other'
let server
let browser
let output = ''
let symptomPresent = false
let failed = false

async function getPort() {
  return await new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Next.js did not become ready within ${timeoutMs}ms`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await getPort()
  const url = `http://127.0.0.1:${port}`
  const nextBin = process.platform === 'win32' ? 'node_modules/.bin/next.cmd' : 'node_modules/.bin/next'
  server = spawn(nextBin, ['dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { output += chunk.toString() })
  server.stderr.on('data', (chunk) => { output += chunk.toString() })

  await waitForServer(url, 120000)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  page.on('console', (message) => {
    const text = message.text()
    if (text.includes(warningText)) symptomPresent = true
  })
  page.on('pageerror', (error) => { output += `\nBrowser error: ${error.message}` })
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.waitForSelector('img', { timeout: 30000 })
  await new Promise((resolve) => setTimeout(resolve, 1000))

  process.exitCode = symptomPresent ? 0 : 1
  console.log(symptomPresent
    ? 'REPRODUCED: browser emitted the incorrect next/image width-or-height warning for two supplied numeric dimensions.'
    : 'ABSENT: browser did not emit the reported next/image warning.')
} catch (error) {
  failed = true
  process.exitCode = 2
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  if (output) console.error(output.slice(-4000))
} finally {
  if (browser) await browser.close()
  await stopServer(server)
  if (failed) process.exitCode = 2
}
