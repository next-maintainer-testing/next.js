import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer'

const port = 32130
const origin = `http://127.0.0.1:${port}`
let server
let browser

function waitForServer(child, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Next.js server did not become ready')), timeoutMs)
    const inspect = (chunk) => {
      const text = chunk.toString()
      process.stdout.write(text)
      if (/Ready in|Local:\s+http/.test(text)) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Next.js server exited early with code ${code}`))
    })
  })
}

async function waitForPath(page, pathname) {
  await page.waitForFunction(
    (expected) => window.location.pathname === expected,
    { timeout: 30000 },
    pathname,
  )
}

try {
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitForServer(server)

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  const pageOneRscRequests = []
  page.on('request', (request) => {
    const headers = request.headers()
    const url = new URL(request.url())
    if (headers.rsc === '1' && url.pathname === '/1') {
      pageOneRscRequests.push({ url: request.url(), routerState: headers['next-router-state-tree'] })
    }
  })

  await page.goto(origin, { waitUntil: 'networkidle0' })
  await page.click('a[href="/0"]')
  await waitForPath(page, '/0')
  await new Promise((resolve) => setTimeout(resolve, 500))
  await page.goBack()
  await waitForPath(page, '/')
  await new Promise((resolve) => setTimeout(resolve, 500))

  await page.click('a[href="/1"]')
  await waitForPath(page, '/1')
  await new Promise((resolve) => setTimeout(resolve, 1500))

  console.log(`Observed ${pageOneRscRequests.length} RSC request(s) for /1 during one navigation`)
  for (const request of pageOneRscRequests) console.log(JSON.stringify(request))

  if (pageOneRscRequests.length >= 2) {
    process.exitCode = 0
  } else if (pageOneRscRequests.length === 1) {
    process.exitCode = 1
  } else {
    process.exitCode = 2
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
        resolve()
      }, 5000)
      server.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
