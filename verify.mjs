import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const host = '127.0.0.1'
let browser
let server
let serverOutput = ''

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, host, () => {
      const address = socket.address()
      socket.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitForServer(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}:\n${serverOutput}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}:\n${serverOutput}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

try {
  const port = await reservePort()
  const url = `http://${host}:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', host, '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-12000)
    })
  }

  await waitForServer(url, server, 120000)
  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  })
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => {
    delete Intl.Locale
  })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(
    () => document.querySelector('#probe')?.getAttribute('data-app-execution') !== 'pending',
    { timeout: 60000 },
  )
  const initial = await page.evaluate(() => {
    const probe = document.querySelector('#probe')
    return {
      instrumentationStarted: globalThis.__polyfillStarted === true,
      localeAvailable: typeof Intl.Locale === 'function',
      appExecution: probe?.getAttribute('data-app-execution'),
      polyfillDoneAtExecution: probe?.getAttribute('data-polyfill-done'),
      text: probe?.textContent,
    }
  })
  await page.waitForFunction(() => globalThis.__polyfillDone === true, { timeout: 15000 })
  const final = await page.evaluate(() => ({
    instrumentationStarted: globalThis.__polyfillStarted === true,
    polyfillDone: globalThis.__polyfillDone === true,
    localeAvailable: typeof Intl.Locale === 'function',
  }))
  console.log(JSON.stringify({ initial, final }))

  if (
    initial.appExecution === 'feature-missing' &&
    initial.polyfillDoneAtExecution === 'false' &&
    final.instrumentationStarted &&
    final.polyfillDone &&
    final.localeAvailable
  ) {
    process.exitCode = 0
  } else if (
    initial.appExecution === 'feature-present' &&
    initial.polyfillDoneAtExecution === 'true' &&
    final.instrumentationStarted &&
    final.polyfillDone &&
    final.localeAvailable
  ) {
    process.exitCode = 1
  } else {
    console.error(`Unexpected observation; check could not classify behavior. Server output:\n${serverOutput}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  if (serverOutput) console.error(`Server output:\n${serverOutput}`)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer(server)
}
