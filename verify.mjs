import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import { dirname, join } from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForChild(child) {
  return await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
}

async function ensureBrowser() {
  const executablePath = puppeteer.executablePath()
  if (existsSync(executablePath)) return

  const versionMatch = executablePath.match(/linux-([^/]+)\//)
  if (!versionMatch) throw new Error(`Cannot determine Chrome version from ${executablePath}`)
  const version = versionMatch[1]
  const versionDirectory = dirname(dirname(executablePath))
  const archiveDirectory = dirname(versionDirectory)
  const archivePath = join(archiveDirectory, `${version}-chrome-linux64.zip`)
  mkdirSync(versionDirectory, { recursive: true })

  if (!existsSync(archivePath)) {
    const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/linux64/chrome-linux64.zip`
    const download = spawn('curl', ['--fail', '--location', '--retry', '3', '--silent', '--show-error', '--output', archivePath, url], {
      stdio: 'inherit',
    })
    const downloadCode = await waitForChild(download)
    if (downloadCode !== 0) throw new Error(`Browser download failed with exit code ${downloadCode}`)
  }

  const unzip = spawn('unzip', ['-q', '-o', archivePath, '-d', versionDirectory], { stdio: 'inherit' })
  const unzipCode = await waitForChild(unzip)
  if (unzipCode !== 0 || !existsSync(executablePath)) {
    throw new Error(`Browser archive extraction failed with exit code ${unzipCode}`)
  }
}

async function getFreePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, child, logs) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${child.exitCode})\n${logs.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(500)
  }
  throw new Error(`Timed out waiting for Next.js\n${logs.join('')}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([exited, sleep(5_000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await Promise.race([exited, sleep(2_000)])
  }
}

let browser
let nextServer
let result = 2
const logs = []

try {
  await ensureBrowser()
  const port = await getFreePort()
  const url = `http://127.0.0.1:${port}`
  nextServer = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextServer.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  nextServer.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  await waitForServer(url, nextServer, logs)
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 120_000 })
  await page.waitForSelector('#trigger-action', { timeout: 30_000 })
  await page.click('#trigger-action')
  await page.waitForFunction(
    () => window.__ISSUE_76803_UNHANDLED__ === true || document.querySelector('[data-error-boundary="rendered"]'),
    { timeout: 30_000 },
  )

  const observed = await page.evaluate(() => ({
    unhandled: window.__ISSUE_76803_UNHANDLED__ === true,
    boundaryRendered: Boolean(document.querySelector('[data-error-boundary="rendered"]')),
    originalPageVisible: Boolean(document.querySelector('[data-page-visible="true"]')),
    status: document.querySelector('#unhandled-status')?.textContent?.trim() ?? null,
  }))

  if (observed.unhandled && !observed.boundaryRendered && observed.originalPageVisible) {
    result = 0
    console.log(`SYMPTOM_PRESENT ${JSON.stringify(observed)}`)
  } else if (observed.boundaryRendered) {
    result = 1
    console.log(`SYMPTOM_ABSENT ${JSON.stringify(observed)}`)
  } else {
    throw new Error(`Unexpected browser state: ${JSON.stringify(observed)}`)
  }
} catch (error) {
  result = 2
  console.error(error?.stack || error)
  if (logs.length) console.error(logs.join('').slice(-10_000))
} finally {
  process.exitCode = result
  if (browser) await browser.close()
  await stopServer(nextServer)
}
