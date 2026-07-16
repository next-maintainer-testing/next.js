import { spawn } from 'node:child_process'
import http from 'node:http'
import process from 'node:process'
import puppeteer from 'puppeteer'

const port = 31000 + (process.pid % 1000)
const origin = `http://127.0.0.1:${port}`
let server = null
let browser = null

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with code ${code} signal ${signal}`))
    })
  })
}

function waitForServer(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(origin, (response) => {
        response.resume()
        resolve()
      })
      request.on('error', () => {
        if (Date.now() >= deadline) reject(new Error('Next.js server did not become ready'))
        else setTimeout(attempt, 200)
      })
      request.setTimeout(1000, () => request.destroy())
    }
    attempt()
  })
}

async function navigateFrom(category) {
  const page = await browser.newPage()
  await page.setCacheEnabled(false)
  const rscResponses = []

  page.on('response', (response) => {
    const request = response.request()
    const url = new URL(response.url())
    if (
      url.pathname === '/product/1' &&
      (url.searchParams.has('_rsc') || request.headers().rsc === '1')
    ) {
      rscResponses.push({
        url: response.url(),
        hash: url.searchParams.get('_rsc'),
        status: response.status(),
      })
    }
  })

  await page.goto(`${origin}/category/${category}`, { waitUntil: 'networkidle0' })
  await Promise.all([
    page.waitForSelector('#shared-product-data', { timeout: 15000 }),
    page.click('#product-link'),
  ])
  await new Promise((resolve) => setTimeout(resolve, 500))
  const productText = await page.$eval('#shared-product-data', (node) => node.textContent)
  const finalPath = new URL(page.url()).pathname
  await page.close()

  if (finalPath !== '/product/1' || productText !== 'Identical shared product payload') {
    throw new Error(`Unexpected navigation result from category ${category}`)
  }

  return { category, productText, requests: rscResponses }
}

let resultCode = 2
try {
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])
  server = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
    { stdio: 'inherit' },
  )
  await waitForServer()

  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const first = await navigateFrom('1')
  const second = await navigateFrom('2')
  const firstHash = first.requests.at(-1)?.hash ?? null
  const secondHash = second.requests.at(-1)?.hash ?? null
  const reproduced =
    first.productText === second.productText &&
    firstHash !== null &&
    secondHash !== null &&
    firstHash !== secondHash

  console.log(JSON.stringify({ first, second, reproduced }, null, 2))
  resultCode = reproduced ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (browser) await browser.close().catch(() => {})
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
        resolve()
      }, 5000)
      server.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
