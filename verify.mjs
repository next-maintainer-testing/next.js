import { spawn } from 'node:child_process'
import net from 'node:net'
import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const nextBin = require.resolve('next/dist/bin/next')
const cwd = new URL('.', import.meta.url).pathname

let server
let browser
let serverOutput = ''
let resultCode = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForServer(url, child, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}\n${serverOutput}`)
}

function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()

    const timeout = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
    }, 5000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      clearTimeout(timeout)
      resolve()
    }
  })
}

try {
  const port = await reservePort()
  const origin = `http://127.0.0.1:${port}`

  server = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

  await waitForServer(origin, server)

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#home-title')

  const initialColor = await page.locator('#home-title').evaluate((element) => getComputedStyle(element).color)
  if (initialColor !== 'rgb(0, 0, 0)') {
    throw new Error(`Expected an unaffected black home heading before navigation, got ${initialColor}`)
  }

  await page.locator('#to-page-2').click()
  await page.waitForURL(`${origin}/page2`)
  await page.waitForSelector('#page-2-title')
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#page-2-title')).color === 'rgb(255, 0, 0)')

  await page.locator('#to-home').click()
  await page.waitForURL(`${origin}/`)
  await page.waitForSelector('#home-title')
  await page.waitForTimeout(500)

  const returnedColor = await page.locator('#home-title').evaluate((element) => getComputedStyle(element).color)
  const symptomPresent = returnedColor === 'rgb(255, 0, 0)'
  console.log(JSON.stringify({ initialColor, page2Color: 'rgb(255, 0, 0)', returnedColor, symptomPresent }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  if (serverOutput) console.error(serverOutput)
  resultCode = 2
} finally {
  process.exitCode = resultCode

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
