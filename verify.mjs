import { spawn } from 'node:child_process'
import net from 'node:net'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

process.exitCode = 2

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getFreePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await sleep(500)
  }
  throw new Error('Timed out waiting for the Next.js server')
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(10_000).then(() => false),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let browser
let nextServer
let resultCode = 2

try {
  const port = await getFreePort()
  const url = `http://127.0.0.1:${port}`
  const nextBin = new URL('./node_modules/.bin/next', import.meta.url).pathname

  nextServer = spawn(nextBin, ['dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextServer.stdout.pipe(process.stderr)
  nextServer.stderr.pipe(process.stderr)

  await waitForServer(url, nextServer)

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })

  await page.waitForFunction(
    () => Boolean(customElements.get('lite-youtube')),
    { timeout: 30_000 },
  )
  await sleep(5_000)

  const observation = await page.evaluate(() => {
    const embed = document.querySelector('lite-youtube')
    if (!embed) return { ready: false, reason: 'lite-youtube element missing' }
    const params = embed.getAttribute('params') || ''
    const iframe = embed.querySelector('iframe') || embed.shadowRoot?.querySelector('iframe') || null
    return {
      ready: true,
      params,
      iframeCreated: Boolean(iframe),
      iframeSrc: iframe?.getAttribute('src') || null,
    }
  })

  if (!observation.ready || !observation.params.includes('autoplay=1')) {
    throw new Error(`The reported autoplay setup was not rendered: ${JSON.stringify(observation)}`)
  }

  const symptomPresent = !observation.iframeCreated
  console.log(JSON.stringify({
    symptom: 'YouTube autoplay did not initialize a player without user interaction',
    symptomPresent,
    observation,
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close()
  if (nextServer) await stopServer(nextServer)
}
