import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import net from 'node:net'
import puppeteer from 'puppeteer'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function chromeExecutable() {
  const chromeCache = join(process.env.PUPPETEER_CACHE_DIR || join(homedir(), '.cache', 'puppeteer'), 'chrome')
  if (!existsSync(chromeCache)) return undefined

  for (const entry of readdirSync(chromeCache)) {
    const executable = join(chromeCache, entry, 'chrome-linux64', 'chrome')
    if (entry.startsWith('linux-') && existsSync(executable)) return executable
  }

  for (const entry of readdirSync(chromeCache)) {
    const match = basename(entry).match(/^(.+)-chrome-linux64\.zip$/)
    if (!match) continue
    const destination = join(chromeCache, `linux-${match[1]}`)
    execFileSync('unzip', ['-q', '-o', join(chromeCache, entry), '-d', destination])
    const executable = join(destination, 'chrome-linux64', 'chrome')
    if (existsSync(executable)) return executable
  }

  return undefined
}

async function availablePort() {
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
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url)
      if (response.ok || response.status === 404) return
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(10_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('close', resolve))
  }
}

const port = await availablePort()
const origin = `http://127.0.0.1:${port}`
let serverOutput = ''
const next = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
next.stdout.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-12_000) })
next.stderr.on('data', (chunk) => { serverOutput = (serverOutput + chunk).slice(-12_000) })

let browser
let exitCode = 2
try {
  await waitForServer(origin, next)
  browser = await puppeteer.launch({
    headless: true,
    executablePath: chromeExecutable(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const page = await browser.newPage()
  let backendRequests = 0
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/backend') backendRequests += 1
  })

  await page.goto(`${origin}/bug`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await delay(4_000)

  const symptomPresent = backendRequests >= 3
  console.log(JSON.stringify({ symptom: 'repeated backend requests from one page load', backendRequests, symptomPresent }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(serverOutput)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  await stopChild(next)
}
