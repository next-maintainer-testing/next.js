import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`))
    })
  })
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next.js server exited with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Next.js server')
}

let server
let browser
let result = 2
try {
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })

  const port = await availablePort()
  server = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'start', '--', '-p', String(port)], {
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  })
  await waitForServer(`http://127.0.0.1:${port}/product/1234/?Page=2`, server)

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: 'shell',
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(`http://127.0.0.1:${port}/product/1234/?Page=2`, { waitUntil: 'networkidle0' })
  const initial = await page.$eval('#series-code', element => element.textContent)
  if (initial !== '1234') throw new Error(`Initial route did not resolve seriesCode: ${initial}`)

  await page.click('#next-product')
  await page.waitForFunction(() => location.pathname === '/product/5678/' && location.search === '?Page=3')
  await new Promise(resolve => setTimeout(resolve, 500))
  const observed = await page.$eval('#series-code', element => element.textContent)
  const queryState = await page.$eval('#query-state', element => element.textContent)
  console.log(JSON.stringify({ initial, navigatedUrl: page.url(), observed, queryState }))

  result = observed === 'undefined' ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  if (server && server.exitCode === null) {
    if (process.platform === 'win32') server.kill('SIGTERM')
    else {
      try { process.kill(-server.pid, 'SIGTERM') } catch {}
    }
    await new Promise(resolve => {
      if (server.exitCode !== null) resolve()
      else server.once('exit', resolve)
    })
  }
}
