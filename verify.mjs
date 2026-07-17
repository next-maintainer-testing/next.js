import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import puppeteer from 'puppeteer'

let browser
let nextProcess
let resultCode = 2
const output = []

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function findBrowserExecutable(directory) {
  if (!existsSync(directory)) return null
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      const found = findBrowserExecutable(path)
      if (found) return found
    } else if (entry.name === 'chrome-headless-shell') {
      return path
    }
  }
  return null
}

function ensureBrowserExecutable() {
  const root = join(process.cwd(), '.cache', 'puppeteer', 'chrome-headless-shell')
  let executable = findBrowserExecutable(root)
  if (!executable) {
    const install = spawnSync(process.execPath, ['install-browser.mjs'], { stdio: 'inherit' })
    if (install.status !== 0) throw new Error(`Browser setup failed with status ${install.status}`)
    executable = findBrowserExecutable(root)
  }
  if (!executable) throw new Error('Chrome Headless Shell executable is unavailable')
  return executable
}

async function waitForServer(url, process, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${process.exitCode}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null) return
  process.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => process.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (process.exitCode === null) {
    process.kill('SIGKILL')
    await new Promise((resolve) => process.once('exit', resolve))
  }
}

async function runCase(page, baseUrl, linkSelector) {
  await page.goto(baseUrl, { waitUntil: 'networkidle0' })
  await page.click(linkSelector)
  await page.waitForFunction(() => location.hash.length > 0)
  const hash = await page.evaluate(() => location.hash)
  await page.keyboard.press('Tab')
  const activeId = await page.evaluate(() => document.activeElement?.id || '')
  return { hash, activeId }
}

try {
  const executablePath = ensureBrowserExecutable()
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}`
  nextProcess = spawn(process.execPath, [
    'node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextProcess.stdout.on('data', (chunk) => output.push(chunk.toString()))
  nextProcess.stderr.on('data', (chunk) => output.push(chunk.toString()))

  await waitForServer(baseUrl, nextProcess)
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()

  const nativeResult = await runCase(page, baseUrl, '#native-link')
  const nextResult = await runCase(page, baseUrl, '#next-link')
  const nativeBaselineWorks = nativeResult.hash === '#native-target' && nativeResult.activeId === 'native-after'
  const nextBehaviorWorks = nextResult.hash === '#next-target' && nextResult.activeId === 'next-after'

  console.log(JSON.stringify({ nativeResult, nextResult, nativeBaselineWorks, nextBehaviorWorks }))
  resultCode = nativeBaselineWorks && !nextBehaviorWorks ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  if (output.length) console.error(output.join('').slice(-12000))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close()
  await stopProcess(nextProcess)
}
