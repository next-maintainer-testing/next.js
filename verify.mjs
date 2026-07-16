import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else if (code !== 0) reject(new Error(`${command} exited ${code}`))
      else resolve()
    })
  })
}

function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`next start exited ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Next.js server')
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
      resolve()
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

let server
let browser
try {
  await rm('.next', { recursive: true, force: true })
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  })

  const port = await getPort()
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit'
  })
  await waitForServer(`http://127.0.0.1:${port}/`, server)

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args
  })
  const controlPage = await browser.newPage()
  const controlResponse = await controlPage.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' })
  const controlRan = await controlPage.evaluate(() => window.__issue69567BeforeInteractive === true)

  const notFoundPage = await browser.newPage()
  const notFoundResponse = await notFoundPage.goto(`http://127.0.0.1:${port}/pl/newsite`, { waitUntil: 'networkidle0' })
  const notFoundRan = await notFoundPage.evaluate(() => window.__issue69567BeforeInteractive === true)

  console.log(JSON.stringify({
    controlStatus: controlResponse?.status(),
    controlBeforeInteractiveRan: controlRan,
    notFoundStatus: notFoundResponse?.status(),
    notFoundBeforeInteractiveRan: notFoundRan
  }))

  if (!controlRan) throw new Error('Control page did not execute the beforeInteractive script')
  process.exitCode = notFoundRan ? 1 : 0
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer(server)
}
