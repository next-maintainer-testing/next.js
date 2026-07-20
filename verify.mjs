import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https'
import { createServer as createNetServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
let upstream
let nextProcess
let output = ''
let result = 2

function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function getFreePort() {
  const server = createNetServer()
  const port = await listen(server)
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
  return port
}

function fetchOriginDirectly(port, cert) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      {
        hostname: '127.0.0.1',
        port,
        path: '/api/foo',
        ca: cert,
        timeout: 5_000,
      },
      (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => (body += chunk))
        response.on('end', () => resolve({ status: response.statusCode, body }))
      },
    )
    request.on('timeout', () => request.destroy(new Error('Direct origin request timed out')))
    request.on('error', reject)
    request.end()
  })
}

async function waitForNext(url) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (nextProcess.exitCode !== null) {
      throw new Error(`Next.js exited during startup with ${nextProcess.exitCode}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('Timed out waiting for Next.js to start')
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const timeout = new Promise((resolve) => setTimeout(resolve, 5_000, 'timeout'))
  if ((await Promise.race([exited, timeout])) === 'timeout' && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const [key, cert] = await Promise.all([
    readFile(join(root, 'certs/localhost-key.pem')),
    readFile(join(root, 'certs/localhost-cert.pem')),
  ])

  upstream = createHttpsServer({ key, cert }, (request, response) => {
    // The original public API is gone. Model its key observable behavior: the
    // HTTPS URL works directly, while the connection made by Next's rewrite
    // proxy is reset. Next's proxy identifies itself with X-Forwarded-*.
    if (request.headers['x-forwarded-host']) {
      request.socket.destroy()
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ reachable: true, path: request.url }))
  })
  const upstreamPort = await listen(upstream)

  const direct = await fetchOriginDirectly(upstreamPort, cert)
  const directPayload = JSON.parse(direct.body)
  if (direct.status !== 200 || directPayload.reachable !== true) {
    throw new Error(`Controlled HTTPS origin failed its direct check (status ${direct.status})`)
  }

  const nextPort = await getFreePort()
  nextProcess = spawn(
    process.execPath,
    [join(root, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(nextPort)],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_EXTRA_CA_CERTS: join(root, 'certs/localhost-cert.pem'),
        UPSTREAM_PORT: String(upstreamPort),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  for (const stream of [nextProcess.stdout, nextProcess.stderr]) {
    stream.on('data', (chunk) => {
      output += chunk.toString()
      if (output.length > 100_000) output = output.slice(-100_000)
    })
  }

  const baseUrl = `http://127.0.0.1:${nextPort}`
  await waitForNext(baseUrl)

  let status = null
  let body = ''
  let requestError = null
  try {
    const response = await fetch(`${baseUrl}/api/foo`, {
      signal: AbortSignal.timeout(30_000),
    })
    status = response.status
    body = await response.text()
  } catch (error) {
    requestError = error
  }

  await new Promise((resolve) => setTimeout(resolve, 500))
  const resetLogged = /Failed to proxy[^\n]*[\s\S]*?(?:ECONNRESET|read ECONNRESET|socket hang up)/i.test(output)
  let payload = null
  try {
    payload = JSON.parse(body)
  } catch {}

  if (resetLogged) {
    console.log(
      `SYMPTOM_PRESENT: Direct HTTPS origin returned 200, but Next.js logged an ECONNRESET proxy failure (proxied status ${status ?? 'none'}).`,
    )
    result = 0
  } else if (status === 200 && payload?.reachable === true && payload?.path === '/api/foo') {
    console.log('SYMPTOM_ABSENT: HTTPS rewrite returned the upstream JSON payload (status 200).')
    result = 1
  } else {
    console.error(
      `CHECK_FAILED: Rewrite did not succeed, but the reported ECONNRESET was not observed (status ${status ?? 'none'}, request error ${requestError?.message ?? 'none'}).`,
    )
    console.error(output.slice(-4_000))
    result = 2
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  console.error(output.slice(-4_000))
  result = 2
} finally {
  process.exitCode = result
  await stopChild(nextProcess)
  if (upstream?.listening) {
    await new Promise((resolve) => upstream.close(resolve))
  }
}
