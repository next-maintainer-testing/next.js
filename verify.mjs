import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const marker = 'issue77847-first'
let server
let browser
let finalCode = 2

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) resolve()
        else retry()
      })
      request.on('error', retry)
      request.setTimeout(2000, () => request.destroy())
    }
    const retry = () => {
      if (Date.now() >= deadline) reject(new Error('Next.js server did not become ready'))
      else setTimeout(probe, 250)
    }
    probe()
  })
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    child.once('exit', resolve)
    child.kill('SIGTERM')
    setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5000)
  })
}

try {
  const port = await getPort()
  const origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let serverOutput = ''
  server.stdout.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000) })
  server.stderr.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-8000) })
  await waitForServer(origin, 90000)

  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless
  })
  const page = await browser.newPage()
  const routerStateHeaders = []
  page.on('request', (request) => {
    const header = request.headers()['next-router-state-tree']
    if (header) routerStateHeaders.push(header)
  })

  await page.goto(origin, { waitUntil: 'networkidle0' })
  await Promise.all([
    page.waitForSelector('#to-filters-2', { timeout: 30000 }),
    page.click('#to-filters')
  ])
  await Promise.all([
    page.waitForSelector('#arrived', { timeout: 30000 }),
    page.click('#to-filters-2')
  ])

  const observations = routerStateHeaders.map((raw) => {
    let decoded = raw
    try { decoded = decodeURIComponent(raw) } catch {}
    return { bytes: Buffer.byteLength(raw), markerCount: decoded.split(marker).length - 1 }
  })
  const maximum = observations.reduce((best, current) => current.markerCount > best.markerCount ? current : best, { bytes: 0, markerCount: 0 })
  console.log(JSON.stringify({ marker, capturedRouterStateHeaders: observations.length, maximum }, null, 2))
  finalCode = maximum.markerCount > 1 ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (browser) await browser.close()
  await stopServer(server)
}
