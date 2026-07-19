import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const children = new Set()

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    children.add(child)
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      children.delete(child)
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`))
    })
  })
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function findChrome() {
  const direct = [
    process.env.CHROME_PATH,
    '/root/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell',
    '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  for (const candidate of direct) {
    if (existsSync(candidate)) return candidate
  }

  const roots = ['/root/.cache/ms-playwright', join(process.env.HOME || '', '.cache/ms-playwright')]
  const wanted = new Set(['chrome-headless-shell', 'headless_shell', 'chrome', 'chromium'])
  for (const root of roots) {
    if (!root || !existsSync(root)) continue
    const stack = [root]
    while (stack.length) {
      const directory = stack.pop()
      for (const entry of readdirSync(directory)) {
        const path = join(directory, entry)
        let stat
        try { stat = statSync(path) } catch { continue }
        if (stat.isDirectory()) stack.push(path)
        else if (wanted.has(entry) && (stat.mode & 0o111)) return path
      }
    }
  }
  return null
}

async function ensureChrome() {
  let chrome = findChrome()
  if (chrome) return chrome
  await run('npx', ['--yes', 'playwright@1.55.0', 'install', 'chromium'])
  chrome = findChrome()
  if (!chrome) throw new Error('Chromium installation completed but no executable was found')
  return chrome
}

async function waitForHttp(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Process exited before ${url} became available`)
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {}
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function connectCdp(url) {
  const socket = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  const listeners = new Map()

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data))
    if (message.id) {
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.message))
      else request.resolve(message.result)
      return
    }
    for (const listener of listeners.get(message.method) || []) listener(message.params)
  })

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  return {
    async send(method, params = {}) {
      await opened
      const id = ++nextId
      return await new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        socket.send(JSON.stringify({ id, method, params }))
      })
    },
    on(method, listener) {
      const current = listeners.get(method) || []
      current.push(listener)
      listeners.set(method, current)
    },
    close() { socket.close() },
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed')
  return result.result.value
}

async function waitForEvaluation(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(cdp, expression)
      if (value) return value
    } catch {}
    await sleep(50)
  }
  return null
}

let app
let browser
let cdp
let profile
let outcome = 2
try {
  await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })

  const appPort = await freePort()
  app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(appPort)], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(app)
  app.stdout.pipe(process.stdout)
  app.stderr.pipe(process.stderr)
  app.once('exit', () => children.delete(app))
  await waitForHttp(`http://127.0.0.1:${appPort}/`, 30000, app)

  const chrome = await ensureChrome()
  const debugPort = await freePort()
  profile = mkdtempSync(join(tmpdir(), 'next-46754-chrome-'))
  browser = spawn(chrome, [
    '--headless',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  children.add(browser)
  browser.stderr.pipe(process.stderr)
  browser.once('exit', () => children.delete(browser))
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, 15000, browser)
  const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?http://127.0.0.1:${appPort}/`, { method: 'PUT' })
  if (!targetResponse.ok) throw new Error(`Could not create browser target: ${targetResponse.status}`)
  const target = await targetResponse.json()
  cdp = connectCdp(target.webSocketDebuggerUrl)
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')

  const homeReady = await waitForEvaluation(cdp, `document.querySelector('h1')?.textContent === 'Home page'`, 15000)
  if (!homeReady) throw new Error('Home page did not render')

  // Give the production Link enough time to prefetch the RSC payload, matching the report.
  await sleep(2500)

  const heldCss = new Map()
  cdp.on('Fetch.requestPaused', ({ requestId, request, resourceType }) => {
    if (resourceType === 'Stylesheet' || /\.(?:css)(?:\?|$)/.test(request.url)) {
      heldCss.set(requestId, request.url)
    } else {
      void cdp.send('Fetch.continueRequest', { requestId })
    }
  })
  await cdp.send('Fetch.enable', {
    patterns: [{ urlPattern: '*', requestStage: 'Request' }],
  })

  const clicked = await evaluate(cdp, `(() => {
    const link = [...document.querySelectorAll('a')].find((item) => new URL(item.href).pathname === '/posts')
    if (!link) return false
    link.click()
    return true
  })()`)
  if (!clicked) throw new Error('Posts link was not found')

  const postStateExpression = `(() => {
    const heading = [...document.querySelectorAll('h1')].find((item) => item.textContent === 'Posts page')
    const card = document.querySelector('li[class]')
    if (!heading || !card) return null
    const style = getComputedStyle(card)
    return { background: style.backgroundColor, display: style.display }
  })()`

  // While all newly requested stylesheets are paused, observe whether the destination DOM
  // becomes visible. Rendering it now is the reported flash of unstyled content.
  const beforeCss = await waitForEvaluation(cdp, postStateExpression, 4000)
  const flashedUnstyled = Boolean(beforeCss && beforeCss.background !== 'rgb(255, 218, 185)')

  const heldStylesheetCount = heldCss.size
  for (const requestId of heldCss.keys()) {
    await cdp.send('Fetch.continueRequest', { requestId })
  }
  heldCss.clear()
  await cdp.send('Fetch.disable')

  const afterCss = await waitForEvaluation(cdp, `(() => {
    const card = document.querySelector('li[class]')
    if (!card) return null
    const background = getComputedStyle(card).backgroundColor
    return background === 'rgb(255, 218, 185)' ? { background } : null
  })()`, 15000)
  if (!afterCss) throw new Error('Posts page never reached its expected peachpuff CSS-module styling')

  console.log(JSON.stringify({
    symptom: 'destination content rendered before its CSS module finished loading',
    heldStylesheetCount,
    beforeCss,
    afterCss,
    reproduced: flashedUnstyled,
  }))
  outcome = flashedUnstyled ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  outcome = 2
} finally {
  // Set the durable result before releasing the last referenced process handles.
  process.exitCode = outcome
  try { cdp?.close() } catch {}
  for (const child of children) {
    try { child.kill('SIGTERM') } catch {}
  }
  await Promise.all([...children].map(async (child) => {
    const deadline = Date.now() + 5000
    while (child.exitCode === null && Date.now() < deadline) await sleep(50)
    if (child.exitCode === null) {
      try { child.kill('SIGKILL') } catch {}
    }
  }))
  if (profile) {
    try { rmSync(profile, { recursive: true, force: true }) } catch {}
  }
}
