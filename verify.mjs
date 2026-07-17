import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright-core'

const cwd = new URL('.', import.meta.url).pathname
let server
let browser
let exitCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal || `exit ${code}`}`))
    })
  })
}

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Server did not become ready: ${lastError}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const exited = new Promise((resolve) => server.once('exit', resolve))
  server.kill('SIGTERM')
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5_000))])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await exited
  }
}

try {
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])

  const port = await freePort()
  const origin = `http://127.0.0.1:${port}`
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    stdio: 'inherit',
  })
  await waitForServer(origin)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const dynamicRscRequests = []
  page.on('response', (response) => {
    const url = new URL(response.url())
    if (url.pathname === '/dynamic' && url.searchParams.has('_rsc')) {
      dynamicRscRequests.push({ at: Date.now(), status: response.status(), url: response.url() })
    }
  })

  await page.goto(origin, { waitUntil: 'networkidle' })

  if (dynamicRscRequests.length === 0) {
    await page.locator('#dynamic-link').hover()
    await page.waitForTimeout(3_000)
  }
  if (dynamicRscRequests.length === 0) {
    throw new Error('The dynamic route was not prefetched, so stale behavior could not be checked')
  }

  await page.getByRole('heading').hover()
  const initial = dynamicRscRequests.length
  const lastPrefetchAt = dynamicRscRequests.at(-1).at
  const remaining = Math.max(0, 6_500 - (Date.now() - lastPrefetchAt))
  await page.waitForTimeout(remaining)

  const secondHoverAt = Date.now()
  await page.locator('#dynamic-link').hover()
  await page.waitForTimeout(3_000)

  const fresh = dynamicRscRequests.slice(initial).filter((request) => request.at >= secondHoverAt)
  const elapsed = ((secondHoverAt - lastPrefetchAt) / 1000).toFixed(1)
  if (fresh.length === 0) {
    console.log(`SYMPTOM PRESENT: after ${elapsed}s (> dynamic staleTime 5s, < static staleTime 20s), hovering the dynamic link sent no fresh RSC request.`)
    exitCode = 0
  } else {
    console.log(`SYMPTOM ABSENT: after ${elapsed}s, hovering the dynamic link sent ${fresh.length} fresh RSC request(s).`)
    exitCode = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (browser) await browser.close()
  await stopServer()
}
