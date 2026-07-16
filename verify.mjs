import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import puppeteer from 'puppeteer'

const host = '127.0.0.1'
const port = await new Promise((resolve, reject) => {
  const socket = createServer()
  socket.once('error', reject)
  socket.listen(0, host, () => {
    const address = socket.address()
    socket.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const hasProcessGroups = process.platform !== 'win32'
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', host, '--port', String(port)],
  {
    detached: hasProcessGroups,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  },
)
let serverLog = ''
server.stdout.on('data', (chunk) => { serverLog += chunk })
server.stderr.on('data', (chunk) => { serverLog += chunk })

let browser
let result = 2
let observation = ''

async function waitForServer(url) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early (${server.exitCode})\n${serverLog}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js\n${serverLog}`)
}

function signalServerTree(signal) {
  try {
    if (hasProcessGroups) process.kill(-server.pid, signal)
    else server.kill(signal)
  } catch (error) {
    if (error.code !== 'ESRCH') throw error
  }
}

function serverTreeExists() {
  try {
    if (hasProcessGroups) process.kill(-server.pid, 0)
    else if (server.exitCode === null) process.kill(server.pid, 0)
    else return false
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}

try {
  const url = `http://${host}:${port}/one`
  await waitForServer(url)
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  await page.setViewport({ width: 900, height: 600 })
  await page.goto(url, { waitUntil: 'networkidle0' })
  await page.waitForSelector('#dynamic-link')
  await page.evaluate(() => window.scrollTo(0, 1400))
  await page.waitForFunction(() => window.scrollY > 1000)
  const before = await page.evaluate(() => window.scrollY)
  await page.click('#dynamic-link')
  await page.waitForFunction(() => location.pathname === '/two')
  await new Promise((resolve) => setTimeout(resolve, 750))
  const after = await page.evaluate(() => window.scrollY)
  const heading = await page.$eval('h1', (element) => element.textContent)
  const symptomPresent = before > 1000 && after > 500 && heading.includes('two')
  result = symptomPresent ? 0 : 1
  observation = `navigation /one -> /two: scrollY before=${before}, after=${after}, heading=${JSON.stringify(heading)}`
} catch (error) {
  result = 2
  observation = error?.stack || String(error)
}

process.exitCode = result
console.log(observation)

if (browser) await browser.close().catch(() => {})
signalServerTree('SIGTERM')
await Promise.race([
  new Promise((resolve) => server.once('exit', resolve)),
  new Promise((resolve) => setTimeout(resolve, 3000)),
])
if (serverTreeExists()) {
  signalServerTree('SIGKILL')
  await new Promise((resolve) => setTimeout(resolve, 250))
}
