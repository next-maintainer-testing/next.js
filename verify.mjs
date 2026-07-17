import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForHttp(url, child, output) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early (${child.exitCode})\n${output()}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${url}\n${output()}`)
}

async function findChromium(root = '/root/.cache/ms-playwright') {
  const preferred = [
    join(root, 'chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell'),
    join(root, 'chromium-1228/chrome-linux64/chrome'),
  ]
  for (const path of preferred) {
    try {
      await readFile(path)
      return path
    } catch {}
  }
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries.sort((a, b) => b.name.localeCompare(a.name))) {
    if (!entry.isDirectory() || !entry.name.startsWith('chromium')) continue
    const base = join(root, entry.name)
    const candidates = entry.name.startsWith('chromium_headless_shell')
      ? [join(base, 'chrome-headless-shell-linux64/chrome-headless-shell')]
      : [join(base, 'chrome-linux64/chrome')]
    for (const path of candidates) {
      try {
        await readFile(path)
        return path
      } catch {}
    }
  }
  return null
}

async function terminate(child) {
  if (!child || child.exitCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  const exited = new Promise((resolve) => child.once('exit', resolve))
  if (await Promise.race([exited.then(() => true), sleep(5_000).then(() => false)])) return
  try { process.kill(-child.pid, 'SIGKILL') } catch {}
  await Promise.race([exited, sleep(2_000)])
}

async function connectCdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('Chrome DevTools websocket failed')), { once: true })
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data ?? '')}`))
    else resolve(message.result)
  })
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const callId = ++id
    pending.set(callId, { resolve, reject })
    ws.send(JSON.stringify({ id: callId, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
  return { ws, send }
}

async function evaluate(send, sessionId, expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  if (result.exceptionDetails) throw new Error(`Browser evaluation failed: ${result.exceptionDetails.text}`)
  return result.result.value
}

async function waitFor(send, sessionId, expression, description, timeout = 30_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await evaluate(send, sessionId, expression)) return
    await sleep(100)
  }
  throw new Error(`Timed out waiting for ${description}`)
}

let nextProcess
let chromeProcess
let profile
let cdp
let output = ''
let code = 2

try {
  const port = await freePort()
  const url = `http://127.0.0.1:${port}`
  nextProcess = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => { output = (output + chunk.toString()).slice(-12_000) })
  }
  await waitForHttp(url, nextProcess, () => output)

  const chromium = await findChromium()
  if (!chromium) throw new Error('No Chromium executable is available')
  profile = await mkdtemp(join(tmpdir(), 'next-scroll-repro-'))
  chromeProcess = spawn(chromium, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=1280,720', 'about:blank',
  ], { detached: true, stdio: ['ignore', 'pipe', 'pipe'] })

  const activePortFile = join(profile, 'DevToolsActivePort')
  let activePort
  const chromeDeadline = Date.now() + 30_000
  while (Date.now() < chromeDeadline) {
    if (chromeProcess.exitCode !== null) throw new Error(`Chromium exited early (${chromeProcess.exitCode})`)
    try {
      activePort = (await readFile(activePortFile, 'utf8')).trim().split(/\r?\n/)
      if (activePort.length >= 2) break
    } catch {}
    await sleep(100)
  }
  if (!activePort || activePort.length < 2) throw new Error('Timed out waiting for Chromium DevTools endpoint')

  cdp = await connectCdp(`ws://127.0.0.1:${activePort[0]}${activePort[1]}`)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Runtime.enable', {}, sessionId)
  await cdp.send('Page.navigate', { url }, sessionId)
  await waitFor(cdp.send, sessionId, `document.readyState === 'complete' && document.querySelectorAll('a[href="/page2"]').length === 2`, 'the initial page and links')
  await sleep(500)

  const before = await evaluate(cdp.send, sessionId, `(() => {
    window.scrollTo(0, document.documentElement.scrollHeight)
    const links = document.querySelectorAll('a[href="/page2"]')
    return { scrollY: window.scrollY, scrollHeight: document.documentElement.scrollHeight, links: links.length }
  })()`)
  if (before.scrollY < 500) throw new Error(`Page did not become scrollable: ${JSON.stringify(before)}`)

  await evaluate(cdp.send, sessionId, `(() => {
    const links = document.querySelectorAll('a[href="/page2"]')
    links[links.length - 1].click()
    return true
  })()`)
  await waitFor(cdp.send, sessionId, `location.pathname === '/page2'`, 'client navigation to /page2')
  await sleep(1_000)
  const after = await evaluate(cdp.send, sessionId, `({ pathname: location.pathname, scrollY: window.scrollY })`)

  const symptomPresent = after.scrollY > 100
  console.log(JSON.stringify({ symptom: 'client navigation fails to reset scroll to the top', before, after, symptomPresent }))
  code = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || error)
  if (output) console.error(`Next.js output:\n${output}`)
  code = 2
} finally {
  process.exitCode = code
  if (cdp?.ws) cdp.ws.close()
  await terminate(chromeProcess)
  await terminate(nextProcess)
  if (profile) await rm(profile, { recursive: true, force: true })
}
