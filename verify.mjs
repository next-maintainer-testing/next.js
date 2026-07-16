import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const port = 3073
let server
let browser

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else resolve(code)
    })
  })
}

async function waitForPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Server did not become ready: ${lastError?.message ?? 'timeout'}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('close', resolve))
  }
}

try {
  await rm('.next', { recursive: true, force: true })
  const { version } = require('next/package.json')
  const major = Number.parseInt(version.split('.')[0], 10)
  const nextBin = require.resolve('next/dist/bin/next')
  const buildArgs = [nextBin, 'build']
  if (major >= 16) buildArgs.push('--webpack')

  const buildCode = await run(process.execPath, buildArgs, {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  if (buildCode !== 0) throw new Error(`next build exited ${buildCode}`)

  server = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  await waitForPage(`http://127.0.0.1:${port}`, 60000)

  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  const response = await page.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' })
  if (!response?.ok()) throw new Error(`Page navigation returned HTTP ${response?.status()}`)

  const observation = await page.locator('#layer-target').evaluate((element) => ({
    color: getComputedStyle(element).color,
    layerRuleSupported: 'CSSLayerBlockRule' in window,
  }))
  console.log(`Observed computed color: ${observation.color}`)
  if (!observation.layerRuleSupported) throw new Error('Browser does not support CSS cascade layers')

  if (observation.color === 'rgb(1, 2, 3)') {
    console.log('Imported layered style was applied; reported symptom is absent.')
    process.exitCode = 1
  } else if (observation.color === 'rgb(0, 0, 0)') {
    console.log('Imported layered style was not applied; reported symptom is present.')
    process.exitCode = 0
  } else {
    throw new Error(`Unexpected computed color: ${observation.color}`)
  }
} catch (error) {
  console.error(error?.stack ?? error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer()
}
