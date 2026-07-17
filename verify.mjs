import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { once } from 'node:events'

const host = '127.0.0.1'
const logs = []
let child
let resultCode = 2

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const { port } = server.address()
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function request(port, requestPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host, port, path: requestPath, method: 'GET' },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          resolve({ status: res.statusCode, location: res.headers.location ?? null, body })
        })
      }
    )
    req.setTimeout(10_000, () => req.destroy(new Error('HTTP request timed out')))
    req.once('error', reject)
    req.end()
  })
}

function redirectPath(location) {
  if (!location) return null
  try {
    const parsed = new URL(location, `http://${host}`)
    return `${parsed.pathname}${parsed.search}`
  } catch {
    return null
  }
}

function isRedirect(response) {
  return [301, 302, 303, 307, 308].includes(response.status)
}

async function waitForServer(port) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    try {
      await request(port, '/api/image?url=ready')
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error('Next.js did not become ready within 120 seconds')
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = once(child, 'exit')
  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), 10_000)),
  ])
  if (timedOut && child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

try {
  const port = await getFreePort()
  child = spawn(
    process.execPath,
    [path.join(process.cwd(), 'node_modules/next/dist/bin/next'), 'dev', '--hostname', host, '--port', String(port)],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) => {
      if (logs.join('').length < 20_000) logs.push(String(chunk))
    })
  }

  await waitForServer(port)

  const originalPath = '/image/https://i.imgur.com/V7WhMQt.jpeg'
  const first = await request(port, originalPath)
  const normalizedPath = redirectPath(first.location)
  let second = null
  if (isRedirect(first) && normalizedPath) {
    second = await request(port, normalizedPath)
  }
  const secondLocation = redirectPath(second?.location)
  const loops = Boolean(
    second &&
      isRedirect(second) &&
      normalizedPath &&
      secondLocation === normalizedPath
  )

  console.log(
    JSON.stringify(
      {
        originalPath,
        first: { status: first.status, location: first.location },
        normalizedPath,
        second: second ? { status: second.status, location: second.location } : null,
        symptom: loops
          ? 'the normalized URL redirects to itself, producing an infinite redirect loop'
          : 'no self-redirect loop was observed',
      },
      null,
      2
    )
  )
  resultCode = loops ? 0 : 1
} catch (error) {
  console.error(`Verification failed: ${error.stack ?? error}`)
  if (logs.length) console.error(`Next.js output:\n${logs.join('')}`)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopServer()
}
