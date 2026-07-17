import { spawn } from 'node:child_process'
import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer'

const root = new URL('.', import.meta.url).pathname
let browser
let server
let build
let finalCode = 2

function runBuild() {
  return new Promise((resolve, reject) => {
    build = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    })
    const timer = setTimeout(() => {
      build.kill('SIGTERM')
      reject(new Error('next build timed out'))
    }, 180_000)
    build.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    build.once('exit', (code, signal) => {
      clearTimeout(timer)
      build = undefined
      if (code === 0) resolve()
      else reject(new Error(`next build failed (code=${code}, signal=${signal})`))
    })
  })
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

async function resolveStaticFile(pathname) {
  const decoded = decodeURIComponent(pathname).replace(/^\/+/, '')
  const safe = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, '')
  const base = join(root, 'out')
  const candidates = pathname.endsWith('/')
    ? [join(base, safe, 'index.html')]
    : [join(base, safe), join(base, `${safe}.html`), join(base, safe, 'index.html')]
  for (const candidate of candidates) {
    if (!candidate.startsWith(base) || !existsSync(candidate)) continue
    if ((await stat(candidate)).isFile()) return candidate
  }
  return null
}

async function startServer() {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1')
      const file = await resolveStaticFile(url.pathname)
      if (!file) {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        response.end('Not found')
        return
      }
      response.writeHead(200, {
        'content-type': contentTypes[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-store',
      })
      createReadStream(file).pipe(response)
    } catch (error) {
      response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
      response.end(String(error))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  return `http://127.0.0.1:${server.address().port}`
}

async function checkLink(origin, selector) {
  const page = await browser.newPage()
  const failedRequests = []
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.url()} (${request.failure()?.errorText || 'failed'})`)
  })
  try {
    await page.goto(origin, { waitUntil: 'networkidle0', timeout: 30_000 })
    await page.click('[data-show-links]')
    await page.waitForSelector(selector)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await page.click(selector)
    try {
      await page.waitForSelector('#blog-post', { timeout: 7_000 })
    } catch {
      // A timeout is the reported symptom if the page remains healthy and unchanged.
    }
    const result = await page.evaluate(() => ({
      path: location.pathname,
      heading: document.querySelector('#blog-post h1')?.textContent || null,
      body: document.body.innerText,
    }))
    const navigated = result.path === '/blog/post-1' && result.heading === 'Blog: post-1'
    console.log(JSON.stringify({ selector, navigated, ...result, failedRequests }))
    return navigated
  } finally {
    await page.close()
  }
}

try {
  await runBuild()
  const origin = await startServer()
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: 'shell',
    args: chromium.args,
  })
  const defaultNavigated = await checkLink(origin, '[data-link-default]')
  const forcedNavigated = await checkLink(origin, '[data-link-force-prefetch]')
  if (!defaultNavigated || !forcedNavigated) {
    console.log(`SYMPTOM PRESENT: default=${defaultNavigated}, forced=${forcedNavigated}`)
    finalCode = 0
  } else {
    console.log('SYMPTOM ABSENT: both mixed-prefetch links navigated successfully')
    finalCode = 1
  }
} catch (error) {
  console.error('CHECK FAILED:', error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (build && build.exitCode === null) {
    build.kill('SIGTERM')
    await new Promise((resolve) => build.once('exit', resolve))
  }
  if (browser) await browser.close()
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  }
}
