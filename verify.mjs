import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Next.js')
}

async function heading(page) {
  return await page.$eval('h1', (element) => element.textContent)
}

const port = await freePort()
const baseUrl = `http://127.0.0.1:${port}`
let output = ''
const next = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
next.stdout.on('data', (chunk) => { output += chunk })
next.stderr.on('data', (chunk) => { output += chunk })

let browser
let result = 2
try {
  await waitForServer(baseUrl, next)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await page.click('#page-a')
  await page.waitForFunction(() => location.pathname === '/a' && document.querySelector('h1')?.textContent === 'A Page')

  await page.goBack({ waitUntil: 'networkidle0' }).catch(() => {})
  await page.waitForFunction(() => location.pathname === '/c')
  await new Promise((resolve) => setTimeout(resolve, 1_000))

  const backUrl = new URL(page.url()).pathname
  const headingAfterBack = await heading(page)
  const symptomPresent = backUrl === '/c' && headingAfterBack !== 'C Page'
  console.log(JSON.stringify({
    next: (await import('next/package.json', { with: { type: 'json' } })).default.version,
    backUrl,
    headingAfterBack,
    expectedHeading: 'C Page',
    symptomPresent,
  }))
  result = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error)
  console.error(output.slice(-4000))
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close().catch(() => {})
  next.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => next.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (next.exitCode === null) next.kill('SIGKILL')
}
