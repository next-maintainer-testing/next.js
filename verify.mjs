import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for next dev')
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

const port = await reservePort()
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let browser

try {
  await waitForServer(origin, child)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'networkidle0' })
  await page.click('#archive-link')
  await page.waitForFunction(() => document.querySelector('[data-page]') !== null)
  const observed = await page.$eval('[data-page]', (element) => ({
    page: element.getAttribute('data-page'),
    text: element.textContent,
    path: location.pathname,
  }))
  console.log(JSON.stringify(observed))
  if (observed.path !== '/archive') {
    console.error(`Unexpected navigation path: ${observed.path}`)
    process.exitCode = 2
  } else if (observed.page === 'intercepted') {
    process.exitCode = 0
  } else if (observed.page === 'archive') {
    process.exitCode = 1
  } else {
    console.error(`Unexpected page marker: ${observed.page}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stop(child)
}
