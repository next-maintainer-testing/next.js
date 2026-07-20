import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import process from 'node:process'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)
const port = 3217
const origin = `http://127.0.0.1:${port}`
let server
let browser

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForServer() {
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${server.exitCode})`)
    }
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error('Timed out waiting for Next.js')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    sleep(5000).then(() => {
      if (server.exitCode === null) server.kill('SIGKILL')
    }),
  ])
}

try {
  server = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
  )
  server.stdout.on('data', (chunk) => process.stdout.write(`[next] ${chunk}`))
  server.stderr.on('data', (chunk) => process.stderr.write(`[next] ${chunk}`))

  await waitForServer()
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--no-sandbox'],
  })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'networkidle0', timeout: 60000 })

  const buttons = await page.$$('button')
  let trigger
  for (const button of buttons) {
    const text = await button.evaluate((element) => element.textContent)
    if (text?.includes('Popover trigger')) {
      trigger = button
      break
    }
  }
  if (!trigger) throw new Error('Popover trigger button was not rendered')

  await trigger.click()
  await sleep(500)
  const observation = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('body *')]
      .filter((element) => element.textContent?.trim() === 'Popover content marker')
      .map((element) => {
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          tag: element.tagName,
          role: element.getAttribute('role'),
          width: rect.width,
          height: rect.height,
          visible:
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity) !== 0 &&
            rect.width > 0 &&
            rect.height > 0,
        }
      })
    return {
      rendered: candidates.length > 0,
      visible: candidates.some((candidate) => candidate.visible),
      candidates,
    }
  })

  const symptomPresent = !observation.visible
  process.exitCode = symptomPresent ? 0 : 1
  console.log(JSON.stringify({ symptom: 'popover does not become visible after click', symptomPresent, observation }))
} catch (error) {
  process.exitCode = 2
  console.error(error?.stack || error)
} finally {
  if (browser) await browser.close()
  await stopServer()
}
