import { spawn } from 'node:child_process'
import http from 'node:http'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const port = 32174
const origin = `http://127.0.0.1:${port}`
const expected = 'Cannot update a component (`Router`) while rendering a different component (`Demo`)'
const expectedFormat = 'Cannot update a component (`%s`) while rendering a different component (`%s`)'
let server
let browser
let infrastructureError
let observed = false
let serverOutput = ''
const browserMessages = []

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function hasReportedSymptom(text) {
  return text.includes(expected) ||
    (text.includes(expectedFormat) && /\bRouter Demo(?: Demo)?\b/.test(text))
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const ready = await new Promise((resolve) => {
      const request = http.get(origin, (response) => {
        response.resume()
        resolve(response.statusCode < 500)
      })
      request.on('error', () => resolve(false))
      request.setTimeout(2000, () => {
        request.destroy()
        resolve(false)
      })
    })
    if (ready) return
    await wait(250)
  }
  throw new Error(`Next.js did not become ready. Output:\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    wait(5000).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }),
  ])
}

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput += chunk.toString()
      if (serverOutput.length > 50000) serverOutput = serverOutput.slice(-50000)
    })
  }
  await waitForServer(120000)

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  page.on('console', (message) => {
    const text = message.text()
    browserMessages.push(text)
    if (hasReportedSymptom(text)) observed = true
  })
  page.on('pageerror', (error) => {
    const text = String(error)
    browserMessages.push(text)
    if (hasReportedSymptom(text)) observed = true
  })
  await page.goto(origin, { waitUntil: 'networkidle2', timeout: 120000 })
  await wait(3000)
} catch (error) {
  infrastructureError = error
} finally {
  if (infrastructureError) {
    process.exitCode = 2
  } else if (observed) {
    process.exitCode = 0
  } else {
    process.exitCode = 1
  }

  console.log(JSON.stringify({
    symptom: expected,
    observed,
    browserMessages: browserMessages.slice(-20),
    infrastructureError: infrastructureError ? String(infrastructureError.stack || infrastructureError) : null,
    serverOutput: infrastructureError ? serverOutput.slice(-5000) : undefined,
  }, null, 2))

  if (browser) await browser.close()
  await stopServer()
}
