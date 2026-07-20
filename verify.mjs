import { spawn } from 'node:child_process'
import net from 'node:net'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

function waitForServer(url, child, timeoutMs = 120_000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const poll = async () => {
      if (child.exitCode !== null) {
        reject(new Error(`next dev exited early with code ${child.exitCode}`))
        return
      }
      try {
        const response = await fetch(url)
        if (response.ok) {
          resolve()
          return
        }
      } catch {}
      if (Date.now() - started > timeoutMs) {
        reject(new Error('timed out waiting for next dev'))
        return
      }
      setTimeout(poll, 250)
    }
    poll()
  })
}

async function stopChild(child) {
  if (child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await exited
  }
}

let browser
let next
let outcome = 2
try {
  const port = await reservePort()
  const url = `http://127.0.0.1:${port}`
  next = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev', '--', '-p', String(port)], {
    cwd: process.cwd(),
    detached: process.platform !== 'win32',
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  next.stdout.on('data', (chunk) => { logs += chunk })
  next.stderr.on('data', (chunk) => { logs += chunk })

  await waitForServer(url, next)
  const { chromium } = await import('playwright')
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(url, { waitUntil: 'networkidle' })

  const observed = await page.evaluate(() => {
    function fiberFor(selector) {
      const element = document.querySelector(selector)
      if (!element) throw new Error(`missing element: ${selector}`)
      const key = Object.keys(element).find((name) => name.startsWith('__reactFiber$'))
      if (!key) throw new Error(`missing React fiber on: ${selector}`)
      const fiber = element[key]
      return {
        source: fiber._debugSource ?? null,
        ownerName: fiber._debugOwner?.type?.displayName ?? fiber._debugOwner?.type?.name ?? null,
        hasSource: fiber._debugSource != null,
        hasOwner: fiber._debugOwner != null,
      }
    }
    return {
      server: fiberFor('[data-fiber-kind="server"]'),
      client: fiberFor('[data-fiber-kind="client"]'),
    }
  })

  const clientControlIsInstrumented = observed.client.hasSource && observed.client.hasOwner
  const serverMetadataIsMissing = !observed.server.hasSource && !observed.server.hasOwner
  console.log(JSON.stringify({ observed, clientControlIsInstrumented, serverMetadataIsMissing }))

  if (!clientControlIsInstrumented) {
    throw new Error('client component control did not expose both _debugSource and _debugOwner')
  }
  outcome = serverMetadataIsMissing ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  outcome = 2
}

process.exitCode = outcome
if (browser) await browser.close()
if (next) await stopChild(next)
