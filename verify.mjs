import { spawn } from 'node:child_process'
import http from 'node:http'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const port = 43160
const origin = `http://127.0.0.1:${port}`
let server
let browser
let output = ''

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(origin, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) {
          resolve()
        } else if (Date.now() >= deadline) {
          reject(new Error(`server returned ${response.statusCode}`))
        } else {
          setTimeout(poll, 200)
        }
      })
      request.on('error', () => {
        if (Date.now() >= deadline) reject(new Error('Next.js server did not become ready'))
        else setTimeout(poll, 200)
      })
      request.setTimeout(2000, () => request.destroy())
    }
    poll()
  })
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
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

try {
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })

  await waitForServer(120000)
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: chromium.args,
  })
  const page = await browser.newPage()
  await page.evaluateOnNewDocument(() => {
    window.__hydrationObservation = {
      dynamicAdded: 0,
      dynamicRemoved: 0,
      loadingAdded: 0,
      events: [],
    }

    const includesId = (node, id) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      return node.id === id || Boolean(node.querySelector?.(`#${id}`))
    }

    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (includesId(node, 'dynamic-content')) {
            window.__hydrationObservation.dynamicAdded += 1
            window.__hydrationObservation.events.push('dynamic-added')
          }
          if (includesId(node, 'dynamic-loading')) {
            window.__hydrationObservation.loadingAdded += 1
            window.__hydrationObservation.events.push('loading-added')
          }
        }
        for (const node of record.removedNodes) {
          if (includesId(node, 'dynamic-content')) {
            window.__hydrationObservation.dynamicRemoved += 1
            window.__hydrationObservation.events.push('dynamic-removed')
          }
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })

  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await new Promise((resolve) => setTimeout(resolve, 2500))
  const observation = await page.evaluate(() => ({
    ...window.__hydrationObservation,
    finalDynamicPresent: Boolean(document.getElementById('dynamic-content')),
    finalLoadingPresent: Boolean(document.getElementById('dynamic-loading')),
    contextInitialized: document.querySelector('header')?.dataset.contextInitialized ?? null,
  }))

  const symptomPresent = observation.dynamicRemoved > 0 && observation.loadingAdded > 0 && observation.finalDynamicPresent
  console.log(JSON.stringify({ symptomPresent, observation }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(JSON.stringify({ checkFailure: String(error), serverOutput: output.slice(-4000) }))
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  await stopServer()
}
