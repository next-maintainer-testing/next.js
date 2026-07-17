import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import puppeteer from 'puppeteer'

const root = process.cwd()
const outDir = path.join(root, 'out')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let server
let browser

function run(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    })
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`${command} timed out`))
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

function contentType(file) {
  if (file.endsWith('.html')) return 'text/html; charset=utf-8'
  if (file.endsWith('.js')) return 'text/javascript; charset=utf-8'
  if (file.endsWith('.css')) return 'text/css; charset=utf-8'
  if (file.endsWith('.json')) return 'application/json'
  if (file.endsWith('.svg')) return 'image/svg+xml'
  if (file.endsWith('.png')) return 'image/png'
  if (file.endsWith('.ico')) return 'image/x-icon'
  if (file.endsWith('.woff2')) return 'font/woff2'
  return 'application/octet-stream'
}

async function resolveFile(urlPath) {
  let pathname = decodeURIComponent(urlPath)
  if (pathname === '/') pathname = '/index.html'
  else if (!path.extname(pathname)) pathname += '.html'
  const candidate = path.resolve(outDir, `.${pathname}`)
  if (!candidate.startsWith(`${outDir}${path.sep}`)) return null
  try {
    if ((await stat(candidate)).isFile()) return candidate
  } catch {}
  return null
}

async function main() {
  await rm(path.join(root, '.next'), { recursive: true, force: true })
  await rm(outDir, { recursive: true, force: true })
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], 180_000)

  const requests = []
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1')
      requests.push({
        pathname: url.pathname,
        destination: req.headers['sec-fetch-dest'] || '',
        accept: req.headers.accept || '',
      })
      const file = await resolveFile(url.pathname)
      if (!file) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      const body = await readFile(file)
      // This omission is the server behavior reported in issue #82451.
      const headers = file.endsWith('.txt')
        ? { 'Content-Length': body.length }
        : { 'Content-Type': contentType(file), 'Content-Length': body.length }
      res.writeHead(200, headers)
      res.end(body)
    } catch (error) {
      res.writeHead(500)
      res.end(String(error))
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  const origin = `http://127.0.0.1:${port}`

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
  const page = await browser.newPage()
  await page.goto(origin, { waitUntil: 'networkidle0' })
  await page.waitForSelector('#page-a-link')
  await page.waitForFunction(() => document.querySelector('#page-a-link')?.getAttribute('href') === '/page-a')

  const prefetchDeadline = Date.now() + 15_000
  while (!requests.some((entry) => entry.pathname === '/page-a.txt')) {
    if (Date.now() > prefetchDeadline) throw new Error('The Link did not prefetch /page-a.txt')
    await delay(100)
  }

  requests.length = 0
  await page.click('#page-a-link')
  await page.waitForFunction(() => location.pathname === '/page-a', { timeout: 15_000 })
  await page.waitForSelector('#page-a-heading', { timeout: 15_000 })
  await delay(500)

  const documentRequests = requests.filter(
    (entry) => entry.pathname === '/page-a' && entry.destination === 'document',
  )
  const symptomPresent = documentRequests.length > 0
  console.log(JSON.stringify({
    symptom: symptomPresent ? 'full document navigation' : 'client-side navigation',
    pageATxtFetched: requests.some((entry) => entry.pathname === '/page-a.txt'),
    pageADocumentRequests: documentRequests.length,
  }))

  // Set the durable result before releasing the final browser and server handles.
  process.exitCode = symptomPresent ? 0 : 1
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((resolve) => server.close(resolve))
}
