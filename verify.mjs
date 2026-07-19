import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile, rm } from 'node:fs/promises'
import net from 'node:net'
import process from 'node:process'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import nextPackage from 'next/package.json' with { type: 'json' }

const sourcePath = new URL('./app/@modal/(.)product/[id]/page.js', import.meta.url)
const initialClass = 'w-[731px]'
const updatedClass = 'w-[319px]'
let server
let browser
let originalSource
let resultCode = 2
let observation = 'verification did not complete'

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

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early with code ${server.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('next dev did not become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    once(server, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await once(server, 'exit')
  }
}

try {
  originalSource = await readFile(sourcePath, 'utf8')
  if (!originalSource.includes(initialClass) || originalSource.includes(updatedClass)) {
    throw new Error('modal source is not in its committed initial state')
  }

  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })
  const port = await getPort()
  const major = Number.parseInt(nextPackage.version, 10)
  const args = ['dev', '-p', String(port)]
  if (major >= 16) args.push('--webpack')

  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', ...args], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })

  const origin = `http://127.0.0.1:${port}`
  await waitForServer(origin, 90000)

  browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1400, height: 1000 },
    executablePath: await chromium.executablePath(),
    headless: 'shell',
  })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 90000 })
  await page.click('[data-testid="open-product"]')
  await page.waitForSelector('[data-testid="modal-width"]', { timeout: 60000 })

  const before = await page.$eval('[data-testid="modal-width"]', (element) => ({
    className: element.className,
    width: Number.parseFloat(getComputedStyle(element).width),
  }))
  if (!before.className.includes(initialClass) || Math.abs(before.width - 731) > 1) {
    throw new Error(`initial modal style was not applied: ${JSON.stringify(before)}`)
  }

  await writeFile(sourcePath, originalSource.replace(initialClass, updatedClass))
  await page.waitForFunction(
    (className) => document.querySelector('[data-testid="modal-width"]')?.className.includes(className),
    { timeout: 60000 },
    updatedClass,
  )

  const styleDeadline = Date.now() + 15000
  let after
  do {
    after = await page.$eval('[data-testid="modal-width"]', (element) => ({
      className: element.className,
      width: Number.parseFloat(getComputedStyle(element).width),
    }))
    if (Math.abs(after.width - 319) <= 1) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  } while (Date.now() < styleDeadline)

  if (Math.abs(after.width - 319) > 1) {
    resultCode = 0
    observation = `symptom present: HMR changed the modal class to ${updatedClass}, but computed width remained ${after.width}px instead of 319px`
  } else {
    resultCode = 1
    observation = `symptom absent: HMR changed the modal class to ${updatedClass} and computed width to ${after.width}px`
  }
} catch (error) {
  observation = `check failed: ${error.stack || error}`
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (originalSource !== undefined) {
    try { await writeFile(sourcePath, originalSource) } catch (error) {
      process.exitCode = 2
      observation += `; failed to restore source: ${error.message}`
    }
  }
  if (browser) {
    try { await browser.close() } catch (error) {
      process.exitCode = 2
      observation += `; failed to close browser: ${error.message}`
    }
  }
  try { await stopServer() } catch (error) {
    process.exitCode = 2
    observation += `; failed to stop server: ${error.message}`
  }
  console.log(observation)
}
