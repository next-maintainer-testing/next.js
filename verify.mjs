import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import net from 'node:net'
import path from 'node:path'

const cwd = process.cwd()
const sourcePath = path.join(cwd, 'src/app/api/health/route.ts')
const sourceUrl = pathToFileURL(sourcePath).href
const timeoutAt = Date.now() + 90_000
const clients = []
let serverReady = false
let child

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function canListen(port) {
  return await new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)))
  })
}

async function reserveInspectorPair() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const first = await new Promise((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        const port = server.address().port
        server.close(() => resolve(port))
      })
    })
    if (first < 65535 && (await canListen(first + 1))) return first
  }
  throw new Error('Could not reserve adjacent inspector ports')
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

class InspectorClient {
  constructor(url) {
    this.url = url
    this.nextId = 0
    this.pending = new Map()
    this.breakpointResolved = false
    this.pausedAtSource = false
  }

  async connect() {
    this.socket = new WebSocket(this.url)
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve
      this.socket.onerror = () => reject(new Error(`Failed to attach to ${this.url}`))
    })
    this.socket.onmessage = (event) => {
      const message = JSON.parse(event.data)
      if (message.id) {
        const request = this.pending.get(message.id)
        if (!request) return
        this.pending.delete(message.id)
        if (message.error) request.reject(new Error(JSON.stringify(message.error)))
        else request.resolve(message.result)
        return
      }
      if (message.method === 'Debugger.breakpointResolved' &&
          message.params.breakpointId === this.breakpointId) {
        this.breakpointResolved = true
      }
      if (message.method === 'Debugger.paused') {
        if (message.params.hitBreakpoints?.includes(this.breakpointId)) {
          this.pausedAtSource = true
        }
        this.send('Debugger.resume').catch(() => {})
      }
    }
    await this.send('Debugger.enable')
    const result = await this.send('Debugger.setBreakpointByUrl', {
      url: sourceUrl,
      lineNumber: 1,
    })
    this.breakpointId = result.breakpointId
    this.breakpointResolved ||= result.locations.length > 0
  }

  send(method, params = {}) {
    const id = ++this.nextId
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  close() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.close()
  }
}

async function stopChild() {
  for (const client of clients) client.close()
  if (!child || child.exitCode !== null) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([exited, sleep(5_000)])
  if (child.exitCode === null) {
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    await Promise.race([exited, sleep(2_000)])
  }
}

try {
  const inspectorPort = await reserveInspectorPair()
  const appPort = await reservePort()
  const nextBin = path.join(cwd, 'node_modules/next/dist/bin/next')
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '-p', String(appPort)], {
    cwd,
    detached: true,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      NODE_OPTIONS: `--inspect=${inspectorPort}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const inspectorUrls = new Set()
  const attachPromises = []
  let output = ''
  const consume = (chunk) => {
    const text = chunk.toString()
    output = (output + text).slice(-20_000)
    if (/Ready in|Local:\s+http/.test(text)) serverReady = true
    for (const match of output.matchAll(/Debugger listening on (ws:\/\/[^\s]+)/g)) {
      const url = match[1]
      if (inspectorUrls.has(url)) continue
      inspectorUrls.add(url)
      const client = new InspectorClient(url)
      clients.push(client)
      attachPromises.push(client.connect())
    }
  }
  child.stdout.on('data', consume)
  child.stderr.on('data', consume)

  while (Date.now() < timeoutAt && (!serverReady || clients.length < 2)) await sleep(100)
  if (!serverReady) throw new Error(`Next.js dev server did not become ready. Output: ${output}`)
  if (clients.length < 2) throw new Error(`Did not discover the Next.js router inspector. Output: ${output}`)
  await Promise.all(attachPromises)

  const response = await fetch(`http://127.0.0.1:${appPort}/api/health`, {
    signal: AbortSignal.timeout(45_000),
  })
  const body = await response.text()
  if (response.status !== 200 || body !== 'OK') {
    throw new Error(`Health route failed: ${response.status} ${JSON.stringify(body)}`)
  }

  await sleep(3_000)
  const bound = clients.some((client) => client.breakpointResolved || client.pausedAtSource)
  if (bound) {
    console.log(`ABSENT: breakpoint for ${sourceUrl} bound in the server debugger and the route returned 200 OK.`)
    process.exitCode = 1
  } else {
    console.log(`PRESENT: breakpoint for ${sourceUrl} remained unbound after the server route executed and returned 200 OK.`)
    process.exitCode = 0
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  process.exitCode = 2
} finally {
  await stopChild()
}
