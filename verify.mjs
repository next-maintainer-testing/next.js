import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import { chromium } from 'playwright-chromium'

const host = '127.0.0.1'
const port = await getFreePort()
let server
let browser

try {
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', host, '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let output = ''
  server.stdout.on('data', chunk => { output += chunk })
  server.stderr.on('data', chunk => { output += chunk })
  await waitForHttp(`http://${host}:${port}/`, server, () => output)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  let actionPostSeen = false
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/') actionPostSeen = true
  })

  await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' })
  await page.locator('#invoke').click()
  await page.waitForFunction(() => document.querySelector('#status')?.textContent !== 'pending', null, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(1000)

  const pathname = new URL(page.url()).pathname
  const redirectedPageVisible = await page.locator('#redirected').isVisible().catch(() => false)
  const status = await page.locator('#status').textContent().catch(() => null)
  const symptomPresent = actionPostSeen && pathname === '/' && !redirectedPageVisible

  console.log(JSON.stringify({ actionPostSeen, pathname, redirectedPageVisible, status, symptomPresent }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise(resolve => server.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 5000))
    ])
    if (server.exitCode === null) server.kill('SIGKILL')
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, host, () => {
      const address = socket.address()
      const port = typeof address === 'object' && address ? address.port : 0
      socket.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForHttp(url, child, getOutput) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early (${child.exitCode})\n${getOutput()}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${getOutput()}`)
}
