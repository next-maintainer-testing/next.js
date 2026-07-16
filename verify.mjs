import { spawn } from 'node:child_process'
import net from 'node:net'
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const host = '127.0.0.1'
const port = await new Promise((resolve, reject) => {
  const server = net.createServer()
  server.once('error', reject)
  server.listen(0, host, () => {
    const address = server.address()
    server.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const server = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
server.stdout.on('data', (chunk) => { logs += chunk })
server.stderr.on('data', (chunk) => { logs += chunk })

let browser
let resultCode = 2
try {
  const deadline = Date.now() + 120_000
  let lastError
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited with ${server.exitCode}\n${logs}`)
    try {
      const response = await fetch(`http://${host}:${port}/`)
      if (response.ok) break
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  if (Date.now() >= deadline) throw new Error(`Next.js did not become ready: ${lastError}\n${logs}`)

  const cachedChromium = '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || (existsSync(cachedChromium) ? cachedChromium : undefined),
  })
  const page = await browser.newPage()
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'networkidle' })
  await page.waitForSelector('#ready')

  const observation = await page.evaluate(() => {
    try {
      window.history.pushState('', '', '/help')
      return { threw: false, pathname: window.location.pathname }
    } catch (error) {
      return { threw: true, name: error.name, message: error.message, pathname: window.location.pathname }
    }
  })
  console.log(JSON.stringify(observation))

  const reportedSymptom = observation.threw && observation.name === 'TypeError' && observation.message.includes("Cannot create property '__NA'")
  resultCode = reportedSymptom ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  console.error(logs)
  resultCode = 2
}

process.exitCode = resultCode
if (browser) await browser.close()
if (server.exitCode === null) {
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) server.kill('SIGKILL')
}
