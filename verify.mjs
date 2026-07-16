import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.cwd()
const port = 3217
const pagePath = path.join(root, 'src/app/page.js')
const pageUrl = pathToFileURL(pagePath).href
const marker = 'issue-79424-breakpoint'
const clients = []
const inspectorUrls = new Set()
const pauses = []
let child
let originalPageSource

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitFor(fn, timeout, label) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      const value = await fn()
      if (value) return value
    } catch (error) {
      last = error
    }
    await sleep(100)
  }
  throw new Error(`${label}${last ? `: ${last.message}` : ''}`)
}

class InspectorClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.seq = 0
    this.pending = new Map()
    this.scripts = []
  }

  async open() {
    await once(this.socket, 'open')
    this.socket.addEventListener('message', message => {
      const payload = JSON.parse(String(message.data))
      if (payload.id) {
        const waiter = this.pending.get(payload.id)
        if (!waiter) return
        this.pending.delete(payload.id)
        if (payload.error) waiter.reject(new Error(payload.error.message))
        else waiter.resolve(payload.result)
      } else if (payload.method === 'Debugger.paused') {
        pauses.push({ client: this, event: payload })
      } else if (payload.method === 'Debugger.scriptParsed') {
        this.scripts.push(payload.params)
      }
    })
    await this.send('Runtime.enable')
    await this.send('Debugger.enable')
  }

  send(method, params = {}) {
    const id = ++this.seq
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`inspector timeout: ${method}`))
      }, 10000)
    })
  }

  close() {
    this.socket.close()
  }
}

function collectInspectorUrls(chunk) {
  for (const match of String(chunk).matchAll(/ws:\/\/127\.0\.0\.1:\d+\/[0-9a-f-]+/gi)) {
    inspectorUrls.add(match[0])
  }
}

async function sourceMapContainsPage(sourceMapURL, scriptURL) {
  if (!sourceMapURL) return false
  try {
    let text
    if (sourceMapURL.startsWith('data:')) {
      const comma = sourceMapURL.indexOf(',')
      const metadata = sourceMapURL.slice(0, comma)
      const payload = sourceMapURL.slice(comma + 1)
      text = metadata.includes(';base64')
        ? Buffer.from(payload, 'base64').toString('utf8')
        : decodeURIComponent(payload)
    } else {
      const resolved = new URL(sourceMapURL, scriptURL)
      if (resolved.protocol !== 'file:') return false
      text = await readFile(fileURLToPath(resolved), 'utf8')
    }
    return text.includes(pageUrl) || text.includes(pagePath)
  } catch {
    return false
  }
}

async function bindSourceBreakpoint(client) {
  for (const script of client.scripts) {
    if (!script.url || !script.sourceMapURL) continue
    let source
    try {
      source = (await client.send('Debugger.getScriptSource', { scriptId: script.scriptId })).scriptSource
    } catch {
      continue
    }
    const markerOffset = source.indexOf(marker)
    if (markerOffset < 0 || !(await sourceMapContainsPage(script.sourceMapURL, script.url))) continue
    const lineNumber = source.slice(0, markerOffset).split('\n').length - 1
    const result = await client.send('Debugger.setBreakpointByUrl', {
      url: script.url,
      lineNumber,
      columnNumber: 0
    })
    if (result.breakpointId && (result.locations || []).length > 0) return true
  }
  return false
}

async function requestAndObserve(label) {
  const controller = new AbortController()
  let response
  let requestError
  let requestDone = false
  const request = fetch(`http://127.0.0.1:${port}/?probe=${label}`, {
    cache: 'no-store',
    signal: controller.signal
  }).then(async value => {
    response = value
    await value.text()
    requestDone = true
  }).catch(error => {
    requestError = error
    requestDone = true
  })

  let pauseCount = 0
  const deadline = Date.now() + 20000
  while (!requestDone && Date.now() < deadline) {
    const pause = pauses.shift()
    if (!pause) {
      await sleep(20)
      continue
    }
    pauseCount++
    await pause.client.send('Debugger.resume')
    if (pauseCount >= 2) {
      controller.abort()
      await Promise.race([request, sleep(1000)])
      return { pauseCount, ok: true }
    }
  }
  if (!requestDone) {
    controller.abort()
    await request.catch(() => {})
    return { pauseCount, ok: false }
  }
  if (requestError) throw requestError
  return { pauseCount, ok: response.ok }
}

async function main() {
  const source = await readFile(pagePath, 'utf8')
  originalPageSource = source
  if (!source.includes(marker)) throw new Error('breakpoint marker not found')

  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', String(port)], {
    cwd: root,
    detached: true,
    env: { ...process.env, NODE_OPTIONS: '--inspect=127.0.0.1:9237' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', collectInspectorUrls)
  child.stderr.on('data', collectInspectorUrls)

  await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`, { cache: 'no-store' })
    await response.text()
    return response.ok
  }, 60000, 'Next.js dev server')
  await waitFor(() => inspectorUrls.size >= 2 || null, 10000, 'Next.js inspector targets')

  for (const url of inspectorUrls) {
    const client = new InspectorClient(url)
    try {
      await client.open()
      clients.push(client)
    } catch {
      client.close()
    }
  }
  if (clients.length === 0) throw new Error('could not attach to a live Next.js inspector target')
  await sleep(500)

  let boundTargets = 0
  for (const client of clients) {
    if (await bindSourceBreakpoint(client)) boundTargets++
  }

  pauses.length = 0
  const first = await requestAndObserve('first')
  let second = { pauseCount: 0, ok: false }
  if (first.ok && first.pauseCount === 1) {
    await writeFile(pagePath, source.replace(marker, `${marker}-edited`))
    await sleep(500)
    pauses.length = 0
    second = await requestAndObserve('after-edit')
  }

  const symptom = boundTargets === 0 || !first.ok || first.pauseCount !== 1 || !second.ok || second.pauseCount !== 1
  if (symptom) {
    console.log(`SYMPTOM_PRESENT boundTargets=${boundTargets} firstPauses=${first.pauseCount} afterEditPauses=${second.pauseCount}`)
    process.exitCode = 0
  } else {
    console.log(`SYMPTOM_ABSENT boundTargets=${boundTargets} breakpoint paused exactly once before and after edit`)
    process.exitCode = 1
  }
}

try {
  await main()
} catch (error) {
  console.error(`CHECK_FAILED ${error.stack || error}`)
  process.exitCode = 2
} finally {
  if (originalPageSource) await writeFile(pagePath, originalPageSource)
  for (const client of clients) client.close()
  if (child && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
    await Promise.race([once(child, 'exit'), sleep(5000)])
    if (child.exitCode === null) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {}
      await Promise.race([once(child, 'exit'), sleep(1000)])
    }
  }
}
