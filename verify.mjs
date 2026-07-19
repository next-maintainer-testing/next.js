import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const ERROR_TEXT = 'This component only works on the client'
let server
let browser
let exitCode = 2
let serverOutput = ''

async function freePort() {
  return await new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.text()
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }, 5000)
    server.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

try {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-20000)
    })
  }

  const initialHtml = await waitForServer(url)
  if (!initialHtml.includes('Loading client-only content')) {
    throw new Error('The server response did not render the Suspense fallback')
  }

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.waitForSelector('[data-testid="client-content"]', { timeout: 30000 })
  await new Promise((resolve) => setTimeout(resolve, 1500))

  const popupVisible = await page.evaluate((expectedText) => {
    const collectText = (root) => {
      let text = root.textContent || ''
      for (const element of root.querySelectorAll('*')) {
        if (element.shadowRoot) text += ` ${collectText(element.shadowRoot)}`
      }
      return text
    }
    const portal = document.querySelector('nextjs-portal')
    if (!portal) return false
    const text = portal.shadowRoot ? collectText(portal.shadowRoot) : collectText(portal)
    return text.includes(expectedText)
  }, ERROR_TEXT)

  exitCode = popupVisible ? 0 : 1
  console.log(popupVisible
    ? 'REPRODUCED: Next.js displayed the development error popup for the intentional server Suspense error.'
    : 'NOT REPRODUCED: The fallback and client retry worked without a Next.js development error popup.')
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  if (serverOutput) console.error(serverOutput)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  await stopServer()
}
