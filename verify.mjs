import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright-chromium'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, processHandle, logs) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${processHandle.exitCode})\n${logs.text}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${logs.text}`)
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    sleep(8_000).then(() => false),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let nextProcess
let browser
const logs = { text: '' }

try {
  const port = await getPort()
  const baseUrl = `http://127.0.0.1:${port}`
  nextProcess = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => {
      logs.text = (logs.text + chunk.toString()).slice(-20_000)
    })
  }

  await waitForServer(baseUrl, nextProcess, logs)
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await Promise.all([
    page.waitForURL((url) => url.searchParams.get('hello') === 'xyz', { timeout: 45_000 }),
    page.locator('#trigger').click(),
  ])
  await sleep(1_000)

  const afterAction = new URL(page.url())
  const actionHello = afterAction.searchParams.get('hello')
  const actionIdentifier = afterAction.searchParams.get('identifier')

  if (actionHello !== 'xyz') {
    throw new Error(`Server-action redirect did not reach hello=xyz: ${afterAction.href}`)
  }

  if (actionIdentifier === 'yolo') {
    process.exitCode = 1
    console.log(`Symptom absent: middleware parameter is present immediately after the server action: ${afterAction.href}`)
  } else if (actionIdentifier === null) {
    await page.reload({ waitUntil: 'networkidle' })
    const afterReload = new URL(page.url())
    if (afterReload.searchParams.get('identifier') !== 'yolo') {
      throw new Error(`Middleware parameter remained absent after reload: ${afterReload.href}`)
    }
    process.exitCode = 0
    console.log(`Symptom present: after action ${afterAction.href}; after reload ${afterReload.href}`)
  } else {
    throw new Error(`Unexpected identifier value after action: ${afterAction.href}`)
  }
} catch (error) {
  process.exitCode = 2
  console.error(error instanceof Error ? error.stack : String(error))
  if (logs.text) console.error(`Next.js output:\n${logs.text}`)
} finally {
  if (browser) await browser.close()
  await stopProcess(nextProcess)
}
