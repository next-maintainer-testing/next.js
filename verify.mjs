import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'
import puppeteer from 'puppeteer'
import { executablePath } from './install-browser.mjs'

const cwd = new URL('.', import.meta.url).pathname
let browser
let server

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const { port } = socket.address()
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode}):\n${output.text}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js:\n${output.text}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function main() {
  const port = await reservePort()
  const output = { text: '' }
  const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
  server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd,
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      output.text = (output.text + chunk.toString()).slice(-12000)
    })
  }

  const pageUrl = `http://127.0.0.1:${port}/`
  await waitForServer(pageUrl, server, output)

  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 })

  const optimizerRequests = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/_next/image?')) optimizerRequests.push(url)
  })

  await page.goto(pageUrl, { waitUntil: 'networkidle0', timeout: 90000 })
  await page.waitForSelector('#fill-image', { timeout: 10000 })
  const rendered = await page.$eval('#fill-image', (image) => ({
    currentSrc: image.currentSrc,
    sizes: image.sizes,
    width: image.getBoundingClientRect().width,
    parentWidth: image.parentElement.getBoundingClientRect().width,
  }))

  const selected = optimizerRequests.at(-1) || rendered.currentSrc
  if (!selected || !selected.includes('/_next/image?')) {
    throw new Error(`No image optimizer request was observed: ${JSON.stringify({ optimizerRequests, rendered })}`)
  }
  const requestedWidth = Number(new URL(selected).searchParams.get('w'))
  if (!Number.isFinite(requestedWidth)) {
    throw new Error(`Optimizer request had no numeric width: ${selected}`)
  }

  const observation = {
    viewportWidth: 1920,
    parentWidth: rendered.parentWidth,
    renderedWidth: rendered.width,
    sizes: rendered.sizes,
    requestedWidth,
    selected,
  }
  console.log(JSON.stringify(observation))

  // The reported symptom is a 1920px request for an image rendered in a 480px parent.
  return requestedWidth === 1920 && rendered.parentWidth === 480 ? 0 : 1
}

let exitCode = 2
try {
  exitCode = await main()
} catch (error) {
  console.error(error?.stack || error)
  exitCode = 2
} finally {
  // Make the result durable before releasing browser and server handles.
  process.exitCode = exitCode
  if (browser) await browser.close()
  await stopServer(server)
}
