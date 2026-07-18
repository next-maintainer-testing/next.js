import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const cwd = process.cwd()
const logPath = path.join(cwd, '.route-calls.jsonl')
let server
let browser

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.on('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`next dev exited early with ${server.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`server returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`server did not become ready: ${lastError}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 10000))
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise(resolve => server.once('exit', resolve))
  }
}

try {
  await rm(logPath, { force: true })
  const port = await getPort()
  const baseUrl = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
  })
  server.stdout.on('data', chunk => process.stdout.write(chunk))
  server.stderr.on('data', chunk => process.stderr.write(chunk))
  await waitForServer(baseUrl)
  await rm(logPath, { force: true })

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args
  })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await rm(logPath, { force: true })
  await page.click('#route-link')
  await new Promise(resolve => setTimeout(resolve, 3000))

  let text = ''
  try { text = await readFile(logPath, 'utf8') } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const calls = text.trim() ? text.trim().split('\n').map(line => JSON.parse(line)) : []
  const rscCalls = calls.filter(call => call.hasRscQuery || call.rscHeader === '1')
  const documentCalls = calls.filter(call => !call.hasRscQuery && call.rscHeader !== '1')
  console.log(`Observed ${calls.length} GET /route calls after one Link click: ${JSON.stringify(calls)}`)

  if (calls.length >= 2 && rscCalls.length >= 1 && documentCalls.length >= 1) {
    console.log('SYMPTOM PRESENT: one Link click caused both an RSC GET and a document GET to the route handler')
    process.exitCode = 0
  } else {
    console.log('SYMPTOM ABSENT: one Link click did not cause both route-handler requests')
    process.exitCode = 1
  }
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer()
}
