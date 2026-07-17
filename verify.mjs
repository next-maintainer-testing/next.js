import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { chromium } from 'playwright'

const logs = []
let app
let browser

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options })
    child.stdout.on('data', (chunk) => process.stdout.write(chunk))
    child.stderr.on('data', (chunk) => process.stderr.write(chunk))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`))
    })
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Next.js did not become ready at ${url}`)
}

async function stopApp() {
  if (!app || app.exitCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { process.kill(-app.pid, 'SIGKILL') } catch {}
      resolve()
    }, 5000)
    app.once('close', () => {
      clearTimeout(timer)
      resolve()
    })
    try { process.kill(-app.pid, 'SIGTERM') } catch {
      clearTimeout(timer)
      resolve()
    }
  })
}

async function main() {
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], { env: process.env })

  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    detached: true,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [app.stdout, app.stderr]) {
    stream.on('data', (chunk) => {
      const text = chunk.toString()
      logs.push(text)
      process.stderr.write(text)
    })
  }
  await waitForServer(origin)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const actionRequests = []
  page.on('request', (request) => {
    if (request.headers()['next-action']) {
      actionRequests.push({ url: request.url(), action: request.headers()['next-action'] })
    }
  })

  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.locator('#invoke').click()

  await page.waitForFunction(() => {
    const value = document.querySelector('#result')?.textContent || ''
    return location.pathname === '/login' || value !== 'idle'
  }, null, { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(1000)

  const pathname = new URL(page.url()).pathname
  const result = await page.locator('#result').textContent().catch(() => null)
  const loginVisible = await page.locator('#login-page').isVisible().catch(() => false)
  const observed = { pathname, result, loginVisible, actionRequestCount: actionRequests.length }
  console.log(JSON.stringify(observed))

  if (actionRequests.length === 0) {
    throw new Error('No Server Action request was observed')
  }

  if (pathname === '/login' || loginVisible) {
    process.exitCode = 1
    console.log('Symptom absent: middleware redirect navigated the browser to /login.')
    return
  }

  if (result === 'ACTION_RAN') {
    process.exitCode = 1
    console.log('Symptom absent: the protected Server Action ran instead of being blocked by middleware.')
    return
  }

  process.exitCode = 0
  console.log(`Symptom present: action was blocked and the browser remained on ${pathname}; client result was ${JSON.stringify(result)}.`)
}

try {
  await main()
} catch (error) {
  process.exitCode = 2
  console.error(error?.stack || error)
  if (logs.length) console.error(logs.slice(-20).join(''))
} finally {
  if (browser) await browser.close().catch(() => {})
  await stopApp()
}
