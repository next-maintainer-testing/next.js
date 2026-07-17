import net from 'node:net'
import path from 'node:path'
import { spawn } from 'node:child_process'
import puppeteer from 'puppeteer-core'
import chromium from '@sparticuz/chromium'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function ensureChrome() {
  return chromium.executablePath()
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 90000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message ?? 'timeout'}`)
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  const stopped = await Promise.race([exited.then(() => true), sleep(5000).then(() => false)])
  if (!stopped && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await exited
  }
}

let nextProcess
let browser
let result = 2
const observation = {
  reportedSymptom: 'React click handler does not run after an HTTP-cache browser Back navigation',
}
let serverOutput = ''

try {
  const executablePath = await ensureChrome()
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  nextProcess = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-12000)
    })
  }

  await waitForServer(`${origin}/`, nextProcess)
  const warmTarget = await fetch(`${origin}/target-page`)
  if (!warmTarget.ok) throw new Error(`Target route warmup returned HTTP ${warmTarget.status}`)
  await warmTarget.arrayBuffer()

  browser = await puppeteer.launch({
    executablePath,
    headless: 'shell',
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => {
    window.__verificationPageShowPersisted = null
    window.addEventListener('pageshow', (event) => {
      window.__verificationPageShowPersisted = event.persisted
    })
  })
  const client = await page.createCDPSession()
  await client.send('Network.enable')
  await client.send('Network.setCacheDisabled', { cacheDisabled: false })

  await page.goto(`${origin}/`, { waitUntil: 'networkidle0', timeout: 90000 })
  await page.waitForSelector('#counter', { timeout: 30000 })
  await page.click('#counter')
  await page.waitForFunction(() => document.querySelector('#counter')?.textContent?.includes('Count: 1'), { timeout: 30000 })
  observation.initialInteractivity = true

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 90000 }),
    page.click('#navigate'),
  ])
  await page.waitForSelector('#target', { timeout: 30000 })

  await page.goBack({ waitUntil: 'load', timeout: 90000 })
  await page.waitForSelector('#counter', { timeout: 30000 })
  await sleep(1500)

  const restored = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0]
    return {
      text: document.querySelector('#counter')?.textContent ?? null,
      transferSize: navigation?.transferSize ?? null,
      encodedBodySize: navigation?.encodedBodySize ?? null,
      navigationType: navigation?.type ?? null,
      pageShowPersisted: window.__verificationPageShowPersisted,
    }
  })
  Object.assign(observation, restored)

  if (restored.pageShowPersisted === true) {
    throw new Error('Back navigation used bfcache instead of re-executing the HTTP-cached document')
  }
  if (restored.transferSize !== 0 || !(restored.encodedBodySize > 0)) {
    throw new Error(`Back navigation was not served from HTTP cache (transferSize=${restored.transferSize}, encodedBodySize=${restored.encodedBodySize})`)
  }

  const beforeMatch = restored.text?.match(/Count:\s*(\d+)/)
  if (!beforeMatch) throw new Error(`Could not read restored counter state: ${restored.text}`)
  const before = Number(beforeMatch[1])
  await page.click('#counter')
  try {
    await page.waitForFunction(
      (value) => document.querySelector('#counter')?.textContent?.includes(`Count: ${value + 1}`),
      { timeout: 5000 },
      before,
    )
  } catch (error) {
    if (error?.name !== 'TimeoutError') throw error
  }
  const afterText = await page.$eval('#counter', (element) => element.textContent)
  const afterMatch = afterText.match(/Count:\s*(\d+)/)
  if (!afterMatch) throw new Error(`Could not read counter after click: ${afterText}`)
  const after = Number(afterMatch[1])
  observation.counterBeforeClick = before
  observation.counterAfterClick = after
  observation.symptomPresent = after === before
  result = after === before ? 0 : 1
} catch (error) {
  observation.checkFailure = error?.stack ?? String(error)
  observation.serverOutput = serverOutput
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close().catch(() => {})
  await stopChild(nextProcess).catch((error) => {
    console.error('Failed to stop Next.js:', error)
    if (process.exitCode === 0 || process.exitCode === 1) process.exitCode = 2
  })
  console.log(JSON.stringify(observation))
}
