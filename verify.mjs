import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { once } from 'node:events'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

let nextServer = null
let browser = null
let exitCode = 2

async function availablePort() {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function waitForPage(url, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = once(child, 'exit')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

try {
  const port = await availablePort()
  const output = []
  nextServer = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '-p',
    String(port),
    '-H',
    '127.0.0.1',
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextServer.stdout.on('data', (chunk) => output.push(chunk.toString()))
  nextServer.stderr.on('data', (chunk) => output.push(chunk.toString()))

  const url = `http://127.0.0.1:${port}`
  try {
    await waitForPage(url, nextServer, 120000)
  } catch (error) {
    throw new Error(`${error.message}\n${output.join('').slice(-4000)}`)
  }

  browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 900, height: 300, deviceScaleFactor: 1 },
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120000 })
  await page.evaluate(async () => {
    await document.fonts.ready
  })

  const observation = await page.evaluate(() => {
    function rasterize(id) {
      const element = document.getElementById(id)
      const style = getComputedStyle(element)
      const canvas = document.createElement('canvas')
      canvas.width = 600
      canvas.height = 80
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#000'
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      context.textBaseline = 'top'
      context.fillText(element.textContent, 5, 10)

      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
      const gray = new Uint8Array(canvas.width * canvas.height)
      let antialiasedPixels = 0
      let totalVariation = 0
      let isolatedDarkPixels = 0

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = y * canvas.width + x
          const value = rgba[index * 4]
          gray[index] = value
          if (value > 0 && value < 255) antialiasedPixels++
          if (x > 0) totalVariation += Math.abs(value - gray[index - 1])
        }
      }

      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const index = y * canvas.width + x
          if (gray[index] >= 128) continue
          let darkNeighbors = 0
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if ((dx !== 0 || dy !== 0) && gray[index + dy * canvas.width + dx] < 128) {
                darkNeighbors++
              }
            }
          }
          if (darkNeighbors <= 1) isolatedDarkPixels++
        }
      }

      return {
        family: style.fontFamily,
        width: context.measureText(element.textContent).width,
        antialiasedPixels,
        totalVariation,
        isolatedDarkPixels,
        gray: Array.from(gray),
      }
    }

    const google = rasterize('google')
    const local = rasterize('local')
    let differingPixels = 0
    for (let index = 0; index < google.gray.length; index++) {
      if (google.gray[index] !== local.gray[index]) differingPixels++
    }
    delete google.gray
    delete local.gray

    const loadedFamilies = Array.from(document.fonts)
      .filter((font) => font.status === 'loaded')
      .map((font) => font.family)

    return { google, local, differingPixels, loadedFamilies }
  })

  const googleLoaded = observation.loadedFamilies.some((family) => observation.google.family.includes(family))
  const localLoaded = observation.loadedFamilies.some((family) => observation.local.family.includes(family))
  if (!googleLoaded || !localLoaded) {
    throw new Error(`Font loading failed: ${JSON.stringify(observation.loadedFamilies)}`)
  }

  const symptomPresent =
    observation.differingPixels > 1000 &&
    observation.google.totalVariation > observation.local.totalVariation * 1.002 &&
    observation.google.isolatedDarkPixels >= observation.local.isolatedDarkPixels + 2 &&
    observation.google.antialiasedPixels <= observation.local.antialiasedPixels - 10

  console.log(JSON.stringify({
    symptom: symptomPresent ? 'Google font has measurably more irregular raster edges' : 'Google font does not have measurably more irregular raster edges',
    ...observation,
  }, null, 2))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  await stopServer(nextServer)
}
