import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const marker = 'Page not found'
const browserBuild = '131.0.6778.204'
const browserCache = join(tmpdir(), 'nextjs-50699-chrome')
let server = null
let browser = null
let profile = null
let exitCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (options.capture) {
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`${command} timed out`))
    }, options.timeout ?? 180000)
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`${command} exited ${code ?? signal}\n${stdout}\n${stderr}`))
    })
  })
}

async function executableUnder(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isFile() && entry.name === 'chrome-headless-shell') return path
    if (entry.isDirectory()) {
      const found = await executableUnder(path)
      if (found) return found
    }
  }
  return null
}

async function getBrowser() {
  let executable = await executableUnder(browserCache)
  if (executable) return executable
  await run('npx', [
    '-y', '@puppeteer/browsers@2.10.10', 'install',
    `chrome-headless-shell@${browserBuild}`, '--path', browserCache,
  ], { capture: true, timeout: 180000 })
  executable = await executableUnder(browserCache)
  if (executable) return executable
  const archiveDir = join(browserCache, 'chrome-headless-shell')
  const archives = (await readdir(archiveDir))
    .filter(name => name.endsWith('.zip'))
    .map(name => join(archiveDir, name))
  if (archives.length !== 1) throw new Error('Chrome archive was not installed uniquely')
  await run('unzip', ['-qo', archives[0], '-d', join(browserCache, 'expanded')], {
    capture: true,
    timeout: 120000,
  })
  executable = await executableUnder(browserCache)
  if (!executable) throw new Error('Chrome executable is missing after extraction')
  return executable
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const socket = createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(error => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForHttp(url, timeout = 30000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return response
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Server did not become ready: ${lastError ?? 'timeout'}`)
}

async function waitForJson(url, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.id = 0
    this.pending = new Map()
    this.waiters = new Map()
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', () => reject(new Error('CDP WebSocket failed')), { once: true })
    })
    this.ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const pending = this.pending.get(message.id)
        if (!pending) return
        this.pending.delete(message.id)
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result)
      } else if (message.method) {
        const waiters = this.waiters.get(message.method) ?? []
        this.waiters.delete(message.method)
        for (const resolve of waiters) resolve(message.params)
      }
    })
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  event(method, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout)
      const done = value => {
        clearTimeout(timer)
        resolve(value)
      }
      this.waiters.set(method, [...(this.waiters.get(method) ?? []), done])
    })
  }
  close() {
    this.ws.close()
  }
}

async function stop(child) {
  if (!child) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  await new Promise(resolve => setTimeout(resolve, 500))
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
  if (child.exitCode === null) {
    await new Promise(resolve => {
      const timer = setTimeout(resolve, 2000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
    })
  }
}

try {
  const executable = await getBrowser()
  await run('npm', ['run', 'build'], { timeout: 180000 })

  const appPort = await freePort()
  server = spawn('npm', ['run', 'start', '--', '-p', String(appPort)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    detached: true,
  })
  const pageUrl = `http://127.0.0.1:${appPort}/en/definitely-missing`
  const initialResponse = await waitForHttp(pageUrl)
  const initialHtml = await initialResponse.text()
  if (!initialHtml.includes(marker)) {
    throw new Error(`The production server response did not contain ${JSON.stringify(marker)}`)
  }

  const debugPort = await freePort()
  profile = await mkdtemp(join(tmpdir(), 'nextjs-50699-profile-'))
  browser = spawn(executable, [
    '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
  let browserStderr = ''
  browser.stderr.on('data', chunk => { browserStderr += chunk })
  await waitForJson(`http://127.0.0.1:${debugPort}/json/version`)
  const targetResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  )
  if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`)
  const target = await targetResponse.json()
  const cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  const loaded = cdp.event('Page.loadEventFired')
  await cdp.send('Page.navigate', { url: pageUrl })
  await loaded
  await new Promise(resolve => setTimeout(resolve, 3000))
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression: `({ text: document.body?.innerText ?? '', html: document.documentElement?.outerHTML ?? '', readyState: document.readyState })`,
    returnByValue: true,
  })
  cdp.close()
  const value = evaluated.result.value
  if (!value || typeof value.text !== 'string') throw new Error('Browser evaluation returned no document body')
  const symptomPresent = !value.text.includes(marker)
  console.log(JSON.stringify({
    initialStatus: initialResponse.status,
    initialContainsNotFound: true,
    hydratedContainsNotFound: !symptomPresent,
    hydratedBodyText: value.text.slice(0, 500),
    readyState: value.readyState,
    browserStderr: browserStderr.slice(0, 1000),
  }))
  exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack ?? String(error))
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await stop(browser)
  await stop(server)
  if (profile) await rm(profile, { recursive: true, force: true })
}
