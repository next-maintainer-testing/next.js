import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { existsSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const root = process.cwd()
const children = []
let cdp
let finalCode = 2

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const { port } = server.address()
  server.close()
  await once(server, 'close')
  return port
}

async function stop(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([once(child, 'exit'), delay(5000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

async function waitFor(check, timeoutMs, label) {
  const started = Date.now()
  let last
  while (Date.now() - started < timeoutMs) {
    try {
      last = await check()
      if (last) return last
    } catch (error) {
      last = error.message
    }
    await delay(200)
  }
  throw new Error(`Timed out waiting for ${label}: ${String(last)}`)
}

class Cdp {
  constructor(url) {
    this.id = 1
    this.pending = new Map()
    this.ws = new WebSocket(url)
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
    this.ws.addEventListener('message', event => {
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
    const id = this.id++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
  close() {
    this.ws.close()
  }
}

async function evaluate(expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

try {
  const port = await freePort()
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  const server = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(server)
  let serverLog = ''
  server.stdout.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12000) })
  server.stderr.on('data', chunk => { serverLog = (serverLog + chunk).slice(-12000) })

  await waitFor(async () => {
    if (server.exitCode !== null) throw new Error(`Next.js exited ${server.exitCode}: ${serverLog}`)
    const response = await fetch(`http://127.0.0.1:${port}/`)
    return response.status === 200
  }, 120000, 'Next.js page')

  const chrome = [
    process.env.CHROME_PATH,
    '/root/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean).find(existsSync)
  if (!chrome) throw new Error('No Chromium binary is available')

  const profile = path.join(root, '.verify-chrome-profile')
  await rm(profile, { recursive: true, force: true })
  const browser = spawn(chrome, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  children.push(browser)

  const activePort = await waitFor(async () => {
    const text = await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')
    return Number(text.split('\n')[0]) || false
  }, 30000, 'Chromium DevTools port')
  const target = await (await fetch(`http://127.0.0.1:${activePort}/json/new`, { method: 'PUT' })).json()
  cdp = new Cdp(target.webSocketDebuggerUrl)
  await cdp.open()
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/` })

  await waitFor(
    () => evaluate(`document.readyState === 'complete' && !!document.querySelector('#complete-upload')`),
    60000,
    'hydrated upload form',
  )
  await evaluate(`document.querySelector('#complete-upload').click(); true`)
  await waitFor(
    () => evaluate(`document.querySelector('#completion').textContent === 'complete'`),
    10000,
    'completed upload update',
  )
  await delay(1500)

  const observation = await evaluate(`(() => {
    const image = document.querySelector('#nested-preview')
    const loading = !!document.querySelector('#uploading-state')
    if (!image) return { uploadComplete: true, previewFound: false, loading }
    const rect = image.getBoundingClientRect()
    return {
      uploadComplete: true,
      previewFound: true,
      loading,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      width: rect.width,
      height: rect.height,
      visible: getComputedStyle(image).visibility === 'visible',
    }
  })()`)
  const symptomPresent = observation.uploadComplete && (
    !observation.previewFound ||
    observation.naturalWidth < 1 ||
    observation.naturalHeight < 1 ||
    observation.width < 1 ||
    observation.height < 1 ||
    !observation.visible
  )
  console.log(JSON.stringify({
    symptom: 'completed nested image upload does not display its preview',
    symptomPresent,
    observation,
  }))
  finalCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error && error.stack || error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (cdp) cdp.close()
  for (const child of children.reverse()) await stop(child)
  await rm(path.join(root, '.verify-chrome-profile'), { recursive: true, force: true })
}
