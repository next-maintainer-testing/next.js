import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import puppeteer from 'puppeteer'

const getPort = () => new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address()
    server.close((error) => error ? reject(error) : resolve(port))
  })
})

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer(url, child) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Timed out waiting for Next.js')
}

const port = await getPort()
const url = `http://127.0.0.1:${port}`
const next = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let serverOutput = ''
next.stdout.on('data', (chunk) => { serverOutput += chunk.toString() })
next.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

let browser
let outcome = 2
let detail = ''
try {
  await waitForServer(url, next)
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()
  const messages = []
  page.on('console', (message) => messages.push(`[${message.type()}] ${message.text()}`))
  page.on('pageerror', (error) => messages.push(`[pageerror] ${error.message}`))
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60_000 })
  await sleep(2_000)

  const mismatch = messages.find((message) =>
    /Prop\s+[`'"]?nonce[`'"]?\s+did not match/i.test(message) ||
    (/Prop[\s\S]*did not match[\s\S]*\bnonce\b/i.test(message) && /Server:/i.test(message)) ||
    (/hydration failed/i.test(message) && /server/i.test(message))
  )
  if (mismatch) {
    outcome = 0
    detail = `Symptom reproduced: ${mismatch}`
  } else {
    outcome = 1
    detail = `Symptom absent. Browser messages: ${messages.length ? messages.join(' | ') : '(none)'}`
  }
} catch (error) {
  outcome = 2
  detail = `Verification failed: ${error.stack || error}`
}

process.exitCode = outcome
if (browser) await browser.close()
if (next.exitCode === null) {
  next.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => next.once('exit', resolve)),
    sleep(5_000).then(() => {
      if (next.exitCode === null) next.kill('SIGKILL')
    }),
  ])
}

console.log(detail)
if (outcome === 2) console.error(serverOutput.slice(-8_000))
