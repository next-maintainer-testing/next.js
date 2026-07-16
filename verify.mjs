import { spawn } from 'node:child_process'
import net from 'node:net'
import { chromium } from 'playwright'

const host = '127.0.0.1'
const logs = []
let server
let browser

function reservePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.once('error', reject)
    socket.listen(0, host, () => {
      const { port } = socket.address()
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function waitForReady(child, port) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Next.js did not become ready within 60 seconds')), 60_000)
    const inspect = (chunk) => {
      const text = chunk.toString()
      logs.push(text)
      if (text.includes('Ready in') || text.includes(`http://${host}:${port}`)) {
        clearTimeout(timeout)
        resolve()
      }
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('exit', (code, signal) => {
      clearTimeout(timeout)
      reject(new Error(`Next.js exited before becoming ready (code=${code}, signal=${signal})`))
    })
  })
}

async function pressTabs(page, count) {
  for (let index = 0; index < count; index += 1) await page.keyboard.press('Tab')
}

async function activeId(page) {
  return page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName || '')
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}

let resultCode = 2
try {
  const port = await reservePort()
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', host, '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await waitForReady(server, port)

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const url = `http://${host}:${port}`

  await page.goto(url, { waitUntil: 'networkidle' })
  await pressTabs(page, 1)
  if (await activeId(page) !== 'native-link') throw new Error('Could not keyboard-focus the native link')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => location.hash === '#native-target')
  await page.keyboard.press('Tab')
  const nativeNextFocus = await activeId(page)

  await page.goto(url, { waitUntil: 'networkidle' })
  await pressTabs(page, 2)
  if (await activeId(page) !== 'next-link') throw new Error('Could not keyboard-focus the Next Link')
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => location.hash === '#next-target')
  await page.keyboard.press('Tab')
  const nextLinkNextFocus = await activeId(page)

  const nativePreservesContext = nativeNextFocus === 'native-destination-action'
  const nextPreservesContext = nextLinkNextFocus === 'next-destination-action'
  console.log(JSON.stringify({ nativeNextFocus, nextLinkNextFocus, nativePreservesContext, nextPreservesContext }))

  if (!nativePreservesContext) {
    throw new Error(`Native-anchor control did not preserve destination context; next focus was ${nativeNextFocus}`)
  }
  resultCode = nextPreservesContext ? 1 : (nextLinkNextFocus === 'after-next' ? 0 : 2)
  if (resultCode === 2) throw new Error(`Unexpected focus after Next Link activation: ${nextLinkNextFocus}`)
} catch (error) {
  console.error(error?.stack || error)
  if (logs.length) console.error(logs.join('').slice(-4000))
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close().catch(() => {})
  await stopServer(server).catch(() => {})
}
