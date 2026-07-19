import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright-core'

const root = new URL('.', import.meta.url).pathname
let nextServer = null
let browser = null
let resultCode = 2
let releaseFont = null

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${signal || `exit ${code}`}`))
    })
  })
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(error => error ? reject(error) : resolve(port))
    })
  })
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Server did not become ready: ${lastError}`)
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise(resolve => child.once('exit', resolve))
  }
}

try {
  const nextPackage = JSON.parse(await readFile(new URL('./node_modules/next/package.json', import.meta.url), 'utf8'))
  const [major, minor] = nextPackage.version.split('.').map(value => Number.parseInt(value, 10))
  const fontImport = major === 13 && minor <= 1 ? '@next/font/local' : 'next/font/local'
  const page = `import localFont from '${fontImport}'

const inter = localFont({
  src: '../public/Inter.woff2',
  weight: '100 900',
  fallback: ['serif'],
})

export default function Home() {
  return <main><span id="font-target" className={inter.className}>WWWWMMMMiiii1111</span></main>
}
`
  await writeFile(new URL('./pages/index.js', import.meta.url), page)
  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })

  console.log(`Testing Next.js ${nextPackage.version} through ${fontImport}`)
  await run(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })

  const port = await freePort()
  nextServer = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
  await waitForHttp(`http://127.0.0.1:${port}/`, 30000)

  browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const pageHandle = await context.newPage()

  let markFontSeen
  const fontSeen = new Promise(resolve => { markFontSeen = resolve })
  const fontGate = new Promise(resolve => { releaseFont = resolve })
  await pageHandle.route(/\.woff2(?:\?.*)?$/, async route => {
    markFontSeen(route.request().url())
    await fontGate
    await route.continue().catch(() => {})
  })

  await pageHandle.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  const requestedFont = await Promise.race([
    fontSeen,
    new Promise((_, reject) => setTimeout(() => reject(new Error('No font request was observed')), 10000)),
  ])
  await pageHandle.locator('#font-target').waitFor({ state: 'visible' })

  // Chrome gives font-display: optional only a very short block period. Holding
  // the font response beyond it models the reporter's cache-reset deployment load.
  await new Promise(resolve => setTimeout(resolve, 500))
  const before = await pageHandle.locator('#font-target').evaluate(element => ({
    width: element.getBoundingClientRect().width,
    family: getComputedStyle(element).fontFamily,
    weight: getComputedStyle(element).fontWeight,
    fontsStatus: document.fonts.status,
  }))

  releaseFont()
  releaseFont = null
  const fontLoad = await pageHandle.evaluate(async () => {
    await document.fonts.ready
    const style = getComputedStyle(document.querySelector('#font-target'))
    let loadResult = 'loaded'
    try {
      await document.fonts.load(`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`)
    } catch (error) {
      loadResult = `rejected: ${error.name}`
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return loadResult
  })
  const after = await pageHandle.locator('#font-target').evaluate(element => ({
    width: element.getBoundingClientRect().width,
    family: getComputedStyle(element).fontFamily,
    weight: getComputedStyle(element).fontWeight,
    fontsStatus: document.fonts.status,
  }))

  const widthDelta = Math.abs(after.width - before.width)
  const symptomPresent = widthDelta < 0.1
  console.log(JSON.stringify({ requestedFont, before, after, fontLoad, widthDelta, symptomPresent }, null, 2))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  if (releaseFont) {
    releaseFont()
    releaseFont = null
  }
  if (browser) await browser.close().catch(error => console.error('Browser cleanup failed:', error))
  await stopChild(nextServer).catch(error => console.error('Server cleanup failed:', error))
}
