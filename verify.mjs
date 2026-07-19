import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

const app1Dir = process.cwd()
const app2Dir = path.resolve(app1Dir, 'app2')
const children = []
const logs = new Map()

function start(command, args, cwd, name) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(child)
  logs.set(name, '')
  const collect = (chunk) => {
    const current = logs.get(name) + chunk.toString()
    logs.set(name, current.slice(-12000))
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  return child
}

async function waitFor(url, predicate = () => true, timeout = 60000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' })
      const body = await response.text()
      if (predicate(response, body)) return { response, body }
      lastError = new Error(`Unexpected response ${response.status} from ${url}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'no response'}`)
}

function walk(root, match, depth = 0) {
  if (depth > 7 || !existsSync(root)) return null
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isFile() && match(full)) return full
    if (entry.isDirectory()) {
      const found = walk(full, match, depth + 1)
      if (found) return found
    }
  }
  return null
}

function ensureBrowser() {
  const cache = path.join(homedir(), '.cache', 'next-repro-chrome-136')
  const isBrowser = (file) => file.endsWith('/chrome-headless-shell')
  let executable = walk(cache, isBrowser)
  if (executable) return executable

  mkdirSync(cache, { recursive: true })
  const install = spawnSync(
    'npx',
    ['--yes', '@puppeteer/browsers@2.10.0', 'install', 'chrome-headless-shell@136.0.7103.94', '--path', cache],
    { encoding: 'utf8', timeout: 180000 }
  )
  if (install.error || install.status !== 0) {
    throw new Error(`Browser install failed: ${install.error?.message || ''}\n${install.stdout}\n${install.stderr}`)
  }

  executable = walk(cache, isBrowser)
  if (executable) return executable

  const zip = walk(cache, (file) => file.endsWith('.zip'))
  if (!zip) throw new Error('Browser archive was not found after installation')
  const unpack = spawnSync('unzip', ['-qo', zip, '-d', path.dirname(zip)], {
    encoding: 'utf8',
    timeout: 60000,
  })
  if (unpack.error || unpack.status !== 0) {
    throw new Error(`Browser extraction failed: ${unpack.error?.message || ''}\n${unpack.stderr}`)
  }
  executable = walk(cache, isBrowser)
  if (!executable) throw new Error('Browser executable was not found after extraction')
  return executable
}

class Cdp {
  constructor(url) {
    this.url = url
    this.nextId = 1
    this.pending = new Map()
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket connection timed out')), 10000)
      this.socket.addEventListener('open', () => {
        clearTimeout(timer)
        resolve()
      }, { once: true })
      this.socket.addEventListener('error', () => {
        clearTimeout(timer)
        reject(new Error('CDP WebSocket connection failed'))
      }, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  close() {
    this.socket?.close()
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`)
  return result.result.value
}

async function pollBrowser(cdp, expression, predicate, timeout = 30000) {
  const deadline = Date.now() + timeout
  let value
  while (Date.now() < deadline) {
    value = await evaluate(cdp, expression)
    if (predicate(value)) return value
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Browser condition timed out; last value: ${JSON.stringify(value)}`)
}

async function cleanup() {
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      try { process.kill(-child.pid, 'SIGTERM') } catch {}
    }
  }
  await Promise.all(children.map((child) => new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL') } catch {}
      resolve()
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })))
}

let cdp
try {
  const app2Next = path.join(app2Dir, 'node_modules', '.bin', 'next')
  if (!existsSync(app2Next)) {
    const install = spawnSync(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-save', 'next@14.1.4', 'react@18.2.0', 'react-dom@18.2.0'],
      { cwd: app2Dir, encoding: 'utf8', timeout: 120000 }
    )
    if (install.error || install.status !== 0) {
      throw new Error(`App2 dependency install failed: ${install.error?.message || ''}\n${install.stdout}\n${install.stderr}`)
    }
  }

  const app1Next = path.join(app1Dir, 'node_modules', '.bin', 'next')
  if (!existsSync(app1Next)) throw new Error('App1 Next.js executable is missing')

  start(app2Next, ['dev', '--port', '3001'], app2Dir, 'app2')
  await waitFor('http://127.0.0.1:3001/app2', (response, body) => response.status === 200 && body.includes('<h1>App2</h1>'))

  start(app1Next, ['dev', '--port', '3000'], app1Dir, 'app1')
  await waitFor('http://127.0.0.1:3000/', (response, body) => response.status === 200 && body.includes('<h1>App1</h1>'))

  const direct = await waitFor(
    'http://127.0.0.1:3000/app2',
    (response, body) => response.status === 200 && body.includes('<h1>App2</h1>')
  )
  if (!direct.body.includes('<h1>App2</h1>')) throw new Error('Direct rewritten navigation did not render App2')

  const browser = ensureBrowser()
  start(browser, [
    '--headless',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--remote-debugging-port=9222',
    '--user-data-dir=/tmp/next-63968-chrome',
    'about:blank',
  ], app1Dir, 'browser')
  await waitFor('http://127.0.0.1:9222/json/version', (response) => response.status === 200, 30000)

  const targetResponse = await fetch('http://127.0.0.1:9222/json/new?about:blank', { method: 'PUT' })
  if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`)
  const target = await targetResponse.json()
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.connect()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url: 'http://127.0.0.1:3000/' })
  await pollBrowser(cdp, 'document.body?.innerText || ""', (text) => text.includes('App1'))
  // Match a human click after hydration and Link prefetch have had time to complete.
  await new Promise((resolve) => setTimeout(resolve, 5000))
  await evaluate(cdp, 'globalThis.__beforeLinkClick = true')

  const clicked = await evaluate(cdp, `(() => {
    const link = document.querySelector('a[href="/app2"]')
    if (!link) return false
    link.click()
    return true
  })()`)
  if (!clicked) throw new Error('The reporter Link to /app2 was not found')

  await pollBrowser(cdp, 'location.pathname', (pathname) => pathname === '/app2')
  await new Promise((resolve) => setTimeout(resolve, 7000))
  const observed = await evaluate(cdp, `({
    pathname: location.pathname,
    body: document.body?.innerText || '',
    heading: document.querySelector('h1')?.textContent || '',
    sameDocument: globalThis.__beforeLinkClick === true
  })`)

  const symptomPresent = observed.pathname === '/app2' && observed.heading !== 'App2'
  const symptomAbsent = observed.pathname === '/app2' && observed.heading === 'App2'
  console.log(JSON.stringify({
    directRefreshRendered: direct.body.includes('<h1>App2</h1>'),
    afterLinkClick: observed,
    symptomPresent,
  }))

  if (!symptomPresent && !symptomAbsent) throw new Error(`Unexpected browser result: ${JSON.stringify(observed)}`)
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error.stack || error)
  for (const [name, output] of logs) {
    if (output) console.error(`--- ${name} output ---\n${output}`)
  }
  process.exitCode = 2
} finally {
  cdp?.close()
  await cleanup()
}
