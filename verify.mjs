import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)
const cwd = new URL('.', import.meta.url).pathname
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with code ${child.exitCode}`)
    }
    try {
      const response = await fetch(url)
      await response.text()
      return
    } catch {
      await sleep(250)
    }
  }
  throw new Error('next dev did not become reachable')
}

let child
let browser
let result = 2
let serverLog = ''

try {
  const port = await availablePort()
  const url = `http://127.0.0.1:${port}/`
  child = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'dev', '--turbopack', '-p', String(port)],
    {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      serverLog = (serverLog + chunk.toString()).slice(-20_000)
    })
  }

  await waitForServer(url, child)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--no-sandbox'],
  })
  const page = await browser.newPage()
  let launchEditorRequest = null
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/__nextjs_launch-editor') {
      launchEditorRequest = request.url()
    }
  })

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(
    () => {
      const find = (root) => {
        const match = root.querySelector?.('.code-frame-link')
        if (match) return match
        for (const element of root.querySelectorAll?.('*') ?? []) {
          if (element.shadowRoot) {
            const nested = find(element.shadowRoot)
            if (nested) return nested
          }
        }
        return null
      }
      const link = find(document)
      return link?.textContent?.includes('app/page.js') ?? false
    },
    { timeout: 60_000 }
  )

  const overlayText = await page.evaluate(() => {
    const collect = (root) => {
      let text = root.textContent ?? ''
      for (const element of root.querySelectorAll?.('*') ?? []) {
        if (element.shadowRoot) text += ` ${collect(element.shadowRoot)}`
      }
      return text
    }
    return collect(document)
  })
  if (
    !overlayText.includes("Module not found: Can't resolve './this-module-does-not-exist'") ||
    !overlayText.includes('app/page.js')
  ) {
    throw new Error('the expected module-not-found development overlay was not rendered')
  }

  const linkHandle = await page.evaluateHandle(() => {
    const find = (root) => {
      const match = root.querySelector?.('.code-frame-link')
      if (match) return match
      for (const element of root.querySelectorAll?.('*') ?? []) {
        if (element.shadowRoot) {
          const nested = find(element.shadowRoot)
          if (nested) return nested
        }
      }
      return null
    }
    return find(document)
  })
  const link = linkHandle.asElement()
  if (!link) throw new Error('the overlay source location was not clickable')
  await link.click()
  await sleep(2_000)

  if (launchEditorRequest) {
    console.log(`ABSENT: clicking app/page.js sent ${launchEditorRequest}`)
    result = 1
  } else {
    console.log('PRESENT: clicking app/page.js sent no /__nextjs_launch-editor request')
    result = 0
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack ?? error}`)
  if (serverLog) console.error(serverLog)
  result = 2
} finally {
  process.exitCode = result
  if (browser) await browser.close().catch(() => {})
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(10_000).then(() => child.kill('SIGKILL')),
    ])
  }
}
