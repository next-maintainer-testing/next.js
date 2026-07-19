import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import process from 'node:process'

const marker = 'issue-60956-home'
const logChunks = []
let nextProcess
let proxy

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function request(port, path) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path }, (res) => {
      const chunks = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({
        status: res.statusCode,
        location: res.headers.location,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    req.setTimeout(10_000, () => req.destroy(new Error('HTTP request timed out')))
    req.on('error', reject)
  })
}

async function waitForNext(port) {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (nextProcess.exitCode !== null) {
      throw new Error(`Next.js exited during startup with code ${nextProcess.exitCode}`)
    }
    try {
      const response = await request(port, '/test')
      if (response.status === 200 && response.body.includes(marker)) return response
      lastError = new Error(`startup probe returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Next.js did not become ready: ${lastError?.message ?? 'unknown error'}`)
}

function startProxy(proxyPort, upstreamPort) {
  return new Promise((resolve, reject) => {
    proxy = http.createServer((incoming, outgoing) => {
      // Match the reported reverse-proxy rule: public /test is sent to the
      // upstream root while the Next.js app itself has basePath "/test".
      const upstreamPath = incoming.url === '/test'
        ? '/'
        : incoming.url.startsWith('/test/')
          ? incoming.url.slice('/test'.length)
          : incoming.url
      const upstream = http.request({
        hostname: '127.0.0.1',
        port: upstreamPort,
        method: incoming.method,
        path: upstreamPath,
        headers: { ...incoming.headers, host: `127.0.0.1:${upstreamPort}` },
      }, (response) => {
        outgoing.writeHead(response.statusCode, response.headers)
        response.pipe(outgoing)
      })
      upstream.on('error', (error) => {
        if (!outgoing.headersSent) outgoing.writeHead(502)
        outgoing.end(`proxy error: ${error.message}`)
      })
      incoming.pipe(upstream)
    })
    proxy.once('error', reject)
    proxy.listen(proxyPort, '127.0.0.1', resolve)
  })
}

async function stopServer(server) {
  if (!server?.listening) return
  await new Promise((resolve) => server.close(resolve))
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
  await exited
  clearTimeout(timer)
}

async function main() {
  const nextPort = await availablePort()
  const proxyPort = await availablePort()
  nextProcess = spawn(process.execPath, [
    'node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(nextPort),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => {
      logChunks.push(chunk)
      if (logChunks.reduce((total, item) => total + item.length, 0) > 100_000) logChunks.shift()
    })
  }

  const direct = await waitForNext(nextPort)
  await startProxy(proxyPort, nextPort)
  const proxied = await request(proxyPort, '/test')

  console.log(JSON.stringify({
    direct: { path: '/test', status: direct.status, marker: direct.body.includes(marker) },
    proxied: { publicPath: '/test', upstreamPath: '/', status: proxied.status, marker: proxied.body.includes(marker), location: proxied.location ?? null },
  }))

  if (proxied.status === 404 && !proxied.body.includes(marker)) return 0
  if (proxied.status >= 500) throw new Error(`proxy check returned ${proxied.status}`)
  return 1
}

let result
try {
  result = await main()
} catch (error) {
  console.error(error.stack ?? error)
  if (logChunks.length) console.error(Buffer.concat(logChunks).toString('utf8'))
  result = 2
}

// Set the durable result before releasing the final referenced handles.
process.exitCode = result
await stopServer(proxy)
await stopChild(nextProcess)
