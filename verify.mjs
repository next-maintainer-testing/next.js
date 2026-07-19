import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function runBuild() {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 40_000) output = output.slice(-40_000)
    })
  }
  const code = await new Promise((resolve) => child.once('exit', resolve))
  if (code !== 0) throw new Error(`Next.js build failed (code ${code}):\n${output}`)
}

async function waitForServer(url, child, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {}
    await delay(250)
  }
  throw new Error('Timed out waiting for Next.js to become ready')
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let next
let browser
let outcome = 2

try {
  await runBuild()
  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  next = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let serverOutput = ''
  for (const stream of [next.stdout, next.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput += chunk.toString()
      if (serverOutput.length > 20_000) serverOutput = serverOutput.slice(-20_000)
    })
  }

  await waitForServer(origin, next)

  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    headless: true,
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 720 })

  let protectedPrefetchSeen = false
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin === origin && url.pathname === '/login' && request.isNavigationRequest() === false) {
      protectedPrefetchSeen = true
    }
  })

  await page.goto(origin, { waitUntil: 'networkidle0' })
  const prefetchDeadline = Date.now() + 15_000
  while (!protectedPrefetchSeen && Date.now() < prefetchDeadline) await delay(100)
  if (!protectedPrefetchSeen) throw new Error('The protected Link was not prefetched')

  await page.click('#set-cookie')
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
  const cookies = await page.cookies(origin)
  if (!cookies.some((cookie) => cookie.name === 'login' && cookie.value === '1')) {
    throw new Error('The Server Action did not set the login cookie')
  }

  await page.click('#authenticated-route')
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })

  const current = new URL(page.url())
  const protectedContent = await page.$('#protected-content')
  const staleRedirect = current.pathname === '/' && current.searchParams.get('login') === '0'
  const reachedProtectedRoute = current.pathname === '/login' && protectedContent !== null

  if (staleRedirect) {
    outcome = 0
    console.log(`SYMPTOM_PRESENT: authenticated client navigation used the prefetched no-cookie redirect (${current.href})`)
  } else if (reachedProtectedRoute) {
    outcome = 1
    console.log(`SYMPTOM_ABSENT: authenticated client navigation reached protected content (${current.href})`)
  } else {
    throw new Error(`Unexpected navigation result: ${current.href}; protectedContent=${protectedContent !== null}`)
  }
} catch (error) {
  outcome = 2
  console.error(`CHECK_FAILED: ${error?.stack || error}`)
} finally {
  process.exitCode = outcome
  if (browser) await browser.close()
  await stopChild(next)
}
