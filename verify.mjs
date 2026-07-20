import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const cwd = process.cwd()
const children = []
let browser
let browserToolsDir
let proxyServer

function start(command, args) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  return child
}

function waitForExit(child, milliseconds = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, milliseconds)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await waitForExit(child)
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await waitForExit(child)
  }
}

async function waitForHttp(url, child, label, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs
  let lastError = ''
  while (Date.now() < deadline) {
    if (child && (child.exitCode !== null || child.signalCode !== null)) {
      throw new Error(`${label} exited before becoming ready`)
    }
    try {
      const response = await fetch(url, { headers: { 'accept-encoding': 'identity' } })
      if (response.ok) return await response.text()
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`${label} did not become ready: ${lastError}`)
}

async function startReplacementProxy() {
  proxyServer = createServer(async (request, response) => {
    try {
      const upstream = await fetch(`http://127.0.0.1:3000${request.url}`, {
        headers: { 'accept-encoding': 'identity' },
      })
      const body = (await upstream.text()).replace(
        '<esi:include src="foo.bar"></esi:include>',
        '<div>foobar</div>',
      )
      response.statusCode = upstream.status
      const contentType = upstream.headers.get('content-type')
      if (contentType) response.setHeader('content-type', contentType)
      response.end(body)
    } catch (error) {
      response.statusCode = 502
      response.end(String(error))
    }
  })
  await new Promise((resolve, reject) => {
    proxyServer.once('error', reject)
    proxyServer.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${proxyServer.address().port}`
}

async function installBrowserTools() {
  browserToolsDir = await mkdtemp(path.join(tmpdir(), 'next-42461-browser-'))
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const install = spawn(npm, [
    'install', '--prefix', browserToolsDir, '--no-save', '--no-package-lock',
    '--ignore-scripts', '--no-audit', '--no-fund',
    'puppeteer-core@25.3.0', '@sparticuz/chromium@149.0.0',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  install.stdout.on('data', (chunk) => { output += chunk })
  install.stderr.on('data', (chunk) => { output += chunk })
  const code = await new Promise((resolve, reject) => {
    install.once('error', reject)
    install.once('exit', resolve)
  })
  if (code !== 0) throw new Error(`browser tooling install failed (${code}): ${output.slice(-1000)}`)

  const puppeteer = require(path.join(browserToolsDir, 'node_modules', 'puppeteer-core'))
  const chromiumModule = await import(pathToFileURL(path.join(browserToolsDir, 'node_modules', '@sparticuz', 'chromium', 'build', 'index.js')).href)
  const chromium = chromiumModule.default
  return { puppeteer, chromium }
}

async function cleanup() {
  if (browser) {
    try { await browser.close() } catch {}
  }
  if (proxyServer) {
    await new Promise((resolve) => proxyServer.close(resolve))
  }
  for (const child of children.reverse()) await stop(child)
  if (browserToolsDir) {
    try { await rm(browserToolsDir, { recursive: true, force: true }) } catch {}
  }
}

async function main() {
  const dev = start(process.execPath, [path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev'])
  let devOutput = ''
  dev.stdout.on('data', (chunk) => { devOutput += chunk })
  dev.stderr.on('data', (chunk) => { devOutput += chunk })
  await waitForHttp('http://127.0.0.1:3000/', dev, 'next dev')

  const proxyUrl = await startReplacementProxy()
  const transformedHtml = await waitForHttp(`${proxyUrl}/`, null, 'replacement proxy')
  if (!transformedHtml.includes('<div>foobar</div>')) {
    throw new Error(`proxy did not replace the ESI include; Next output: ${devOutput.slice(-1000)}`)
  }

  const { puppeteer, chromium } = await installBrowserTools()
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  })
  const page = await browser.newPage()
  const diagnostics = []
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      diagnostics.push(`${message.type()}: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`))
  await page.goto(`${proxyUrl}/`, { waitUntil: 'networkidle0', timeout: 90000 })
  await new Promise((resolve) => setTimeout(resolve, 3000))

  const diagnosticText = diagnostics.join('\n')
  const hydrationMismatch = /hydration failed|hydrating this suspense boundary|error while hydrating|did not match|does not match|expected server html|matching <esi:include|server html was replaced/i.test(diagnosticText)
  if (hydrationMismatch) {
    console.log(`Observed hydration failure after the reporter's ESI replacement:\n${diagnosticText.slice(0, 4000)}`)
    return true
  }

  console.log(`No hydration mismatch diagnostic was emitted. Browser diagnostics:\n${diagnosticText.slice(0, 4000) || '(none)'}`)
  return false
}

try {
  const reproduced = await main()
  process.exitCode = reproduced ? 0 : 1
} catch (error) {
  console.error(error && error.stack ? error.stack : error)
  process.exitCode = 2
} finally {
  await cleanup()
}
