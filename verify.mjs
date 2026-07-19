import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
let child
let logs = ''

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function request(port, pathname, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: pathname,
        method: 'GET',
        headers: { Host: `${host}:${port}` },
      },
      (res) => {
        res.resume()
        res.once('end', () => resolve({ status: res.statusCode, location: res.headers.location }))
      },
    )
    req.setTimeout(20_000, () => req.destroy(new Error('request timed out')))
    req.once('error', reject)
    req.end()
  })
}

async function waitUntilReady(port) {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited with ${child.exitCode}`)
    try {
      const response = await request(port, '/signin', 'localhost')
      if (response.status) return
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`next dev did not become ready: ${lastError?.message ?? 'timeout'}`)
}

async function stopServer() {
  if (!child || child.exitCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  try {
    if (process.platform === 'win32') child.kill('SIGTERM')
    else process.kill(-child.pid, 'SIGTERM')
  } catch {}
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
  ])
  if (!stopped) {
    try {
      if (process.platform === 'win32') child.kill('SIGKILL')
      else process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await closed
  }
}

try {
  const port = await reservePort()
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
    cwd: root,
    detached: process.platform !== 'win32',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })

  await waitUntilReady(port)
  const response = await request(port, '/', 'foobar.localhost')
  const expected = `http://localhost:${port}/signin?domainKey=foobar`
  const symptomPresent = response.location === '/signin?domainKey=foobar'

  console.log(JSON.stringify({
    status: response.status,
    location: response.location ?? null,
    expected,
    symptomPresent,
  }))

  if (![301, 302, 303, 307, 308].includes(response.status) || !response.location) {
    console.error(`check failed: expected a redirect response; server logs:\n${logs.slice(-4000)}`)
    process.exitCode = 2
  } else if (symptomPresent) {
    process.exitCode = 0
  } else if (response.location === expected) {
    process.exitCode = 1
  } else {
    console.error(`check failed: unexpected Location header ${JSON.stringify(response.location)}; server logs:\n${logs.slice(-4000)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(`${error.stack ?? error}\nserver logs:\n${logs.slice(-4000)}`)
  process.exitCode = 2
} finally {
  await stopServer()
}
