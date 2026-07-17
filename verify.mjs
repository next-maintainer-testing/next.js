import { spawn } from 'node:child_process'
import { request } from 'node:http'
import { createConnection, createServer } from 'node:net'
import { resolve } from 'node:path'

const cwd = process.cwd()
const nextBin = resolve(cwd, 'node_modules/next/dist/bin/next')
let child
let outcome = 2

function reservePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolvePort(port))
    })
  })
}

function waitForPort(port, deadline) {
  return new Promise((resolveReady, reject) => {
    const attempt = () => {
      if (child?.exitCode !== null) {
        reject(new Error(`Next.js exited before accepting requests (code ${child.exitCode})`))
        return
      }
      const socket = createConnection({ host: '127.0.0.1', port })
      socket.setTimeout(500)
      socket.once('connect', () => {
        socket.destroy()
        resolveReady()
      })
      const retry = () => {
        socket.destroy()
        if (Date.now() >= deadline) reject(new Error('Timed out waiting for Next.js'))
        else setTimeout(attempt, 100)
      }
      socket.once('error', retry)
      socket.once('timeout', retry)
    }
    attempt()
  })
}

function fetchRoot(port) {
  return new Promise((resolveResponse, reject) => {
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/',
      method: 'GET',
      headers: { 'Accept-Language': 'fr-XX,en' },
    }, (res) => {
      res.resume()
      res.once('end', () => resolveResponse({
        status: res.statusCode,
        location: res.headers.location ?? null,
      }))
    })
    req.setTimeout(60000, () => req.destroy(new Error('Request timed out')))
    req.once('error', reject)
    req.end()
  })
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  await new Promise((resolveExit) => {
    const force = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5000)
    child.once('close', () => {
      clearTimeout(force)
      resolveExit()
    })
    child.kill('SIGTERM')
  })
}

try {
  const port = await reservePort()
  const nodeOptions = [process.env.NODE_OPTIONS, '--openssl-legacy-provider'].filter(Boolean).join(' ')
  child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NODE_OPTIONS: nodeOptions, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(process.stdout)
  child.stderr.pipe(process.stderr)

  await waitForPort(port, Date.now() + 60000)
  const response = await fetchRoot(port)
  const locationPath = response.location
    ? new URL(response.location, `http://127.0.0.1:${port}`).pathname
    : null
  const routedToFrench = locationPath === '/fr' || locationPath?.startsWith('/fr/')

  console.log(JSON.stringify({
    request: { path: '/', acceptLanguage: 'fr-XX,en' },
    response: { status: response.status, location: response.location },
    expected: 'redirect to /fr',
  }))

  if (routedToFrench) outcome = 1
  else if (response.status === 200 || (response.status >= 300 && response.status < 400)) outcome = 0
  else {
    console.error(`Unexpected HTTP status ${response.status}`)
    outcome = 2
  }
} catch (error) {
  console.error(error?.stack || error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopChild()
}
