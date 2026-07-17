import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import process from 'node:process'
import sparticuzChromium from '@sparticuz/chromium'
import { chromium as playwrightChromium } from 'playwright-core'

const cwd = new URL('.', import.meta.url).pathname
const output = []
let browser
let server

function log(chunk) {
  const text = chunk.toString()
  output.push(text)
  if (output.join('').length > 20000) output.shift()
}

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

function request(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (response) => {
      response.resume()
      response.once('end', () => resolve(response.statusCode))
    })
    req.once('error', reject)
    req.setTimeout(2000, () => req.destroy(new Error('request timeout')))
  })
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early with ${server.exitCode}`)
    try {
      const status = await request(url)
      if (status >= 200 && status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  let timer
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => { timer = setTimeout(resolve, 5000) }),
  ])
  if (timer) clearTimeout(timer)
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  const port = await getPort()
  const origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', log)
  server.stderr.on('data', log)
  await waitForServer(origin, 90000)

  browser = await playwrightChromium.launch({
    executablePath: await sparticuzChromium.executablePath(),
    args: sparticuzChromium.args,
    headless: true,
  })
  const page = await browser.newPage()
  page.setDefaultTimeout(30000)
  await page.goto(origin, { waitUntil: 'networkidle' })
  if (await page.locator('#signin-modal').count()) {
    throw new Error('Modal unexpectedly rendered on the initial home page')
  }

  await page.locator('#open-signin').click()
  await page.waitForURL(`${origin}/signin`)
  await page.locator('#signin-modal').waitFor({ state: 'visible' })

  await page.locator('#return-home').click()
  await page.waitForURL(`${origin}/`)
  await page.waitForTimeout(1500)
  const staleModalVisible = await page.locator('#signin-modal').isVisible().catch(() => false)

  process.exitCode = staleModalVisible ? 0 : 1
  console.log(staleModalVisible
    ? 'SYMPTOM PRESENT: signin modal remains visible after client navigation returned to /'
    : 'SYMPTOM ABSENT: signin modal was dismissed after client navigation returned to /')
} catch (error) {
  process.exitCode = 2
  console.error(`CHECK FAILED: ${error.stack || error}`)
  if (output.length) console.error(output.join('').slice(-20000))
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopServer().catch(() => {})
}
