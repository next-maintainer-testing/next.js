import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile } from 'node:fs/promises'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

const symptom = "Cannot read properties of undefined (reading 'getStackAddendum')"
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function availablePort() {
  const listener = createServer()
  await new Promise((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const { port } = listener.address()
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
  return port
}

let server
let serverExit
let browser
let result = 2
let serverLog = ''

try {
  const { version } = JSON.parse(await readFile(new URL('./node_modules/next/package.json', import.meta.url), 'utf8'))
  const major = Number.parseInt(version, 10)
  const port = await availablePort()
  const args = ['node_modules/next/dist/bin/next', 'dev']
  if (major >= 16) args.push('--webpack')
  args.push('-H', '127.0.0.1', '-p', String(port))

  server = spawn(process.execPath, args, {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverExit = new Promise((resolve) => server.once('exit', (code, signal) => resolve({ code, signal })))
  const record = (chunk) => {
    serverLog = (serverLog + chunk.toString()).slice(-20000)
  }
  server.stdout.on('data', record)
  server.stderr.on('data', record)

  const url = `http://127.0.0.1:${port}/test`
  const deadline = Date.now() + 90000
  let ready = false
  while (Date.now() < deadline && server.exitCode === null) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await delay(200)
  }
  if (!ready) throw new Error(`Next.js dev server did not serve /test\n${serverLog}`)

  browser = await puppeteer.launch({
    headless: true,
    executablePath: await chromium.executablePath(),
    args: [...chromium.args, '--no-sandbox'],
  })
  const page = await browser.newPage()
  const observations = []
  page.on('console', (message) => {
    observations.push(message.text())
    for (const argument of message.args()) {
      const remote = argument.remoteObject()
      if (remote.description) observations.push(remote.description)
      if (remote.value) observations.push(String(remote.value))
    }
  })
  page.on('pageerror', (error) => observations.push(error.stack || error.message))

  const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 })
  if (!response) throw new Error('Browser navigation returned no response')
  await delay(1000)

  const observed = observations.join('\n')
  if (observed.includes(symptom)) {
    console.log(`SYMPTOM PRESENT on next ${version}: ${symptom}`)
    result = 0
  } else {
    console.log(`SYMPTOM ABSENT on next ${version}; HTTP ${response.status()}`)
    result = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error.message}`)
  if (serverLog) console.error(serverLog)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) server.kill('SIGTERM')
  if (serverExit) {
    await Promise.race([serverExit, delay(5000)])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await serverExit
    }
  }
}
