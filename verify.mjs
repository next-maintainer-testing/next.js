import http from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

let upstreamRequests = 0
let nextChild
let upstream
let output = ''

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = once(child, 'exit')
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000)
  await exited
  clearTimeout(timer)
}

async function closeServer(server) {
  if (!server?.listening) return
  await new Promise((resolve) => server.close(resolve))
}

async function waitForReady(child) {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Next.js dev server did not become ready\n${output}`)),
      120_000,
    )
    const inspect = (chunk) => {
      output = (output + chunk.toString()).slice(-20_000)
      if (/\bready\b/i.test(output)) {
        clearTimeout(timeout)
        child.stdout.off('data', inspect)
        child.stderr.off('data', inspect)
        resolve()
      }
    }
    child.stdout.on('data', inspect)
    child.stderr.on('data', inspect)
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Next.js exited before becoming ready (code ${code})\n${output}`))
    })
  })
}

async function render(url) {
  upstreamRequests = 0
  const response = await fetch(url, {
    headers: { connection: 'close', 'cache-control': 'no-cache' },
  })
  const body = await response.text()
  if (!response.ok || !body.includes('fetch-results')) {
    throw new Error(`page render failed with ${response.status}: ${body.slice(0, 500)}`)
  }
  return upstreamRequests
}

try {
  upstream = http.createServer((request, response) => {
    upstreamRequests += 1
    const requestId = upstreamRequests
    setTimeout(() => {
      response.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      })
      response.end(JSON.stringify({ requestId }))
    }, 500)
  })
  const upstreamPort = await listen(upstream)

  const portProbe = http.createServer()
  const nextPort = await listen(portProbe)
  await closeServer(portProbe)

  nextChild = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '-p', String(nextPort)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        REPRO_UPSTREAM_URL: `http://127.0.0.1:${upstreamPort}/data`,
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  await waitForReady(nextChild)

  const baseUrl = `http://127.0.0.1:${nextPort}`
  const firstRenderRequests = await render(`${baseUrl}/`)
  const faviconResponse = await fetch(`${baseUrl}/favicon.ico`)
  if (!faviconResponse.ok) {
    throw new Error(`favicon request failed with ${faviconResponse.status}`)
  }
  await faviconResponse.arrayBuffer()
  const secondRenderRequests = await render(`${baseUrl}/`)
  const symptomPresent = firstRenderRequests === 1 && secondRenderRequests > 1

  console.log(JSON.stringify({ firstRenderRequests, secondRenderRequests, symptomPresent }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
} finally {
  await stopChild(nextChild)
  await closeServer(upstream)
}
