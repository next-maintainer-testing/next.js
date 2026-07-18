import { spawn, spawnSync } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'
import puppeteer from 'puppeteer'

const port = 3200 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
let server
let browser
let serverOutput = ''

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function extractBrowser(archive, installDir) {
  return spawnSync('unzip', ['-oq', archive, '-d', installDir], {
    encoding: 'utf8',
    timeout: 120000,
  })
}

async function ensureBrowser() {
  const chromeExecutable = puppeteer.executablePath()
  if (await exists(chromeExecutable)) return chromeExecutable

  const chromeInstallDir = dirname(dirname(chromeExecutable))
  const build = basename(chromeInstallDir).replace(/^linux-/, '')
  const cacheRoot = dirname(dirname(chromeInstallDir))
  const shellBase = join(cacheRoot, 'chrome-headless-shell')
  const shellInstallDir = join(shellBase, `linux-${build}`)
  const shellExecutable = join(shellInstallDir, 'chrome-headless-shell-linux64', 'chrome-headless-shell')
  const archive = join(shellBase, `${build}-chrome-headless-shell-linux64.zip`)
  if (await exists(shellExecutable)) return shellExecutable

  // Some constrained runners leave Puppeteer's downloaded zip incompletely
  // expanded. Finish extracting that same pinned browser archive if necessary.
  if (await exists(archive)) {
    const extract = extractBrowser(archive, shellInstallDir)
    if (extract.status === 0 && await exists(shellExecutable)) return shellExecutable
  }

  await rm(shellInstallDir, { recursive: true, force: true })
  const install = spawnSync(process.execPath, ['node_modules/puppeteer/lib/cjs/puppeteer/node/cli.js', 'browsers', 'install', 'chrome-headless-shell'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120000,
  })
  if (await exists(shellExecutable)) return shellExecutable

  const extract = extractBrowser(archive, shellInstallDir)
  if (extract.status !== 0 || !(await exists(shellExecutable))) {
    const installMessage = install.stderr || install.stdout || `exit ${install.status}`
    throw new Error(`Chrome installation failed: ${installMessage}\nChrome extraction failed: ${extract.stderr || extract.stdout}`)
  }
  return shellExecutable
}

async function waitForServer(timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${server.exitCode}: ${serverOutput.slice(-2000)}`)
    }
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js dev server: ${serverOutput.slice(-2000)}`)
}

async function clickAndMeasure(page, href) {
  const before = await page.evaluate(() => globalThis.__issue78429HeaderRenders || 0)
  await page.click(`a[href="${href}"]`)
  await page.waitForFunction((expected) => location.pathname === expected, {}, href)
  await new Promise((resolve) => setTimeout(resolve, 1200))
  const after = await page.evaluate(() => globalThis.__issue78429HeaderRenders || 0)
  return after - before
}

async function cleanup() {
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
    if (server.exitCode === null) {
      server.kill('SIGKILL')
      await new Promise((resolve) => server.once('exit', resolve))
    }
  }
}

try {
  const executablePath = await ensureBrowser()
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'networkidle0' })

  // Warm both async routes, then measure repeated client navigations between them.
  await clickAndMeasure(page, '/page23')
  await clickAndMeasure(page, '/page24')
  const measurements = []
  for (const href of ['/page23', '/page24', '/page23', '/page24']) {
    measurements.push(await clickAndMeasure(page, href))
  }

  const excessive = measurements.filter((count) => count > 2).length
  console.log(JSON.stringify({
    measurements,
    excessive,
    criterion: 'at least 3 of 4 async navigations render Header more than twice',
  }))
  process.exitCode = excessive >= 3 ? 0 : 1
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await cleanup()
}
