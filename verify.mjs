import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeout ?? 180000)
    child.on('error', reject)
    child.on('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} exited with ${code ?? signal}\n${stdout}\n${stderr}`))
    })
  })
}

async function openPort() {
  const server = createNetServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

function findFile(root, name) {
  if (!existsSync(root)) return null
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isFile() && entry.name === name) return path
    if (entry.isDirectory()) {
      const found = findFile(path, name)
      if (found) return found
    }
  }
  return null
}

function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

function countRedPixels(path) {
  const png = readFileSync(path)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  if (!png.subarray(0, 8).equals(signature)) throw new Error('Chrome screenshot is not a PNG')

  let offset = 8
  let width
  let height
  let bitDepth
  let colorType
  let interlace
  const idat = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }

  if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
    throw new Error(`Unsupported PNG format: depth=${bitDepth}, color=${colorType}, interlace=${interlace}`)
  }
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(idat))
  const pixels = Buffer.alloc(stride * height)
  let sourceOffset = 0
  let red = 0

  for (let y = 0; y < height; y++) {
    const filter = raw[sourceOffset++]
    const rowOffset = y * stride
    const previousOffset = rowOffset - stride
    for (let x = 0; x < stride; x++) {
      const value = raw[sourceOffset++]
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0
      const up = y > 0 ? pixels[previousOffset + x] : 0
      const upLeft = y > 0 && x >= channels ? pixels[previousOffset + x - channels] : 0
      let decoded
      if (filter === 0) decoded = value
      else if (filter === 1) decoded = (value + left) & 255
      else if (filter === 2) decoded = (value + up) & 255
      else if (filter === 3) decoded = (value + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) decoded = (value + paeth(left, up, upLeft)) & 255
      else throw new Error(`Unsupported PNG filter ${filter}`)
      pixels[rowOffset + x] = decoded
    }
    for (let x = 0; x < width; x++) {
      const i = rowOffset + x * channels
      const alpha = channels === 4 ? pixels[i + 3] : 255
      if (pixels[i] > 180 && pixels[i + 1] < 100 && pixels[i + 2] < 100 && alpha > 128) red++
    }
  }
  return { red, width, height }
}

async function waitForPage(url, server) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next.js exited early with code ${server.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Timed out waiting for the Next.js page')
}

let server
let assetServer
try {
  const [port, assetPort] = await Promise.all([openPort(), openPort()])
  const blurSvg = readFileSync(join(process.cwd(), 'public', 'blur.svg'))
  let blurRequests = 0
  assetServer = createHttpServer((request, response) => {
    if (request.url === '/blur.svg') {
      blurRequests++
      response.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Content-Length': blurSvg.length })
      response.end(blurSvg)
    } else {
      response.writeHead(404)
      response.end()
    }
  })
  await new Promise((resolve, reject) => {
    assetServer.once('error', reject)
    assetServer.listen(assetPort, '127.0.0.1', resolve)
  })

  const url = `http://127.0.0.1:${port}/`
  const blurUrl = `http://127.0.0.1:${assetPort}/blur.svg`
  server = spawn(process.execPath, [join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_BLUR_URL: blurUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let serverLog = ''
  server.stdout.on('data', (chunk) => { serverLog += chunk })
  server.stderr.on('data', (chunk) => { serverLog += chunk })
  await waitForPage(url, server)

  const assetResponse = await fetch(blurUrl)
  if (!assetResponse.ok || !(await assetResponse.text()).includes('#ef1010')) {
    throw new Error('Controlled URL placeholder asset is unavailable')
  }
  const chromeRoot = join(tmpdir(), 'next-issue-42140-chrome')
  let chrome = findFile(chromeRoot, 'chrome-headless-shell')
  if (!chrome) {
    await run('npx', ['--yes', '@puppeteer/browsers@3.0.6', 'install', 'chrome-headless-shell@151.0.7922.34', '--path', chromeRoot], { timeout: 180000 })
    chrome = findFile(chromeRoot, 'chrome-headless-shell')
  }
  if (!chrome) throw new Error('Pinned Chrome Headless Shell was not installed')

  const runId = `${process.pid}-${createHash('sha1').update(process.cwd()).digest('hex').slice(0, 8)}`
  const screenshot = join(tmpdir(), `next-issue-42140-${runId}.png`)
  await run(chrome, [
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--run-all-compositor-stages-before-draw',
    '--virtual-time-budget=5000',
    '--window-size=640,480',
    `--user-data-dir=${join(tmpdir(), `next-issue-42140-profile-${runId}`)}`,
    `--screenshot=${screenshot}`,
    url,
  ], { timeout: 30000 })

  const { red, width, height } = countRedPixels(screenshot)
  const placeholderPainted = red > 1000
  console.log(JSON.stringify({
    nextVersion: JSON.parse(readFileSync(join(process.cwd(), 'node_modules', 'next', 'package.json'), 'utf8')).version,
    browser: 'chrome-headless-shell 151.0.7922.34',
    controlledBlurUrlServed: true,
    browserBlurRequests: Math.max(0, blurRequests - 1),
    screenshot: `${width}x${height}`,
    redPlaceholderPixels: red,
    placeholderPainted,
  }))
  process.exitCode = placeholderPainted ? 1 : 0
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    const exited = new Promise((resolve) => server.once('close', resolve))
    await Promise.race([exited, sleep(5000)])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await new Promise((resolve) => server.once('close', resolve))
    }
  }
  if (assetServer) {
    await new Promise((resolve) => assetServer.close(resolve))
  }
}
