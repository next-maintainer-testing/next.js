import net from 'node:net'
import { spawn } from 'node:child_process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const output = []
let server
let browser
let result = 2

function record(chunk) {
  const text = chunk.toString()
  output.push(text)
  if (output.join('').length > 12000) output.shift()
}

async function freePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const { port } = socket.address()
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise(resolve => child.once('exit', resolve))
  }
}

try {
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', record)
  server.stderr.on('data', record)
  await waitForServer(`${origin}/projects/1`, server)

  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })
  const page = await browser.newPage()
  await page.goto(`${origin}/projects/1`, { waitUntil: 'networkidle0' })
  await page.click('[data-open-create]')
  await page.waitForSelector('[data-create-modal]', { timeout: 30000 })

  const actionResponsePromise = page.waitForResponse(
    response => response.request().method() === 'POST',
    { timeout: 30000 },
  )
  await page.click('[data-submit]')
  const actionResponse = await actionResponsePromise
  if (actionResponse.status() >= 500) {
    throw new Error(`Server action failed with HTTP ${actionResponse.status()}`)
  }
  await new Promise(resolve => setTimeout(resolve, 1500))

  const modalStillOpen = await page.$('[data-create-modal]') !== null
  const finalPath = new URL(page.url()).pathname
  console.log(JSON.stringify({ modalStillOpen, finalPath, actionStatus: actionResponse.status() }))
  result = modalStillOpen ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(output.join('').slice(-12000))
  result = 2
} finally {
  process.exitCode = result
  if (browser) {
    try {
      await browser.close()
    } catch (error) {
      console.error(`Browser cleanup failed: ${error}`)
      process.exitCode = 2
    }
  }
  try {
    await stopServer(server)
  } catch (error) {
    console.error(`Server cleanup failed: ${error}`)
    process.exitCode = 2
  }
}
