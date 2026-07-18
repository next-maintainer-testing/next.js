import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const marker = 'Page changed from static to dynamic at runtime /one, reason: cookies'
let child
let logs = ''
let result = 2

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function request(url, options = {}, timeout = 5000) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(timeout) })
  return { status: response.status, body: await response.text() }
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  const closed = new Promise((resolve) => child.once('close', resolve))
  child.kill('SIGTERM')
  await Promise.race([closed, delay(5000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await closed
  }
}

try {
  const port = await freePort()
  child = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  const origin = `http://127.0.0.1:${port}`
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) break
    try {
      const home = await request(`${origin}/`, {}, 2000)
      if (home.status === 200) {
        ready = true
        break
      }
    } catch {}
    await delay(500)
  }

  if (!ready) {
    console.error('Verification failed: Next.js dev server did not become ready.')
    console.error(logs.slice(-4000))
  } else {
    const route = await request(`${origin}/one`, { headers: { cookie: 'test=works' } }, 30000)
    for (let attempt = 0; attempt < 20 && !logs.includes(marker); attempt++) await delay(100)

    if (route.status === 500 && (logs.includes(marker) || route.body.includes(marker))) {
      console.log(`Symptom reproduced: GET /one returned HTTP ${route.status} with the static-to-dynamic cookies error.`)
      result = 0
    } else if (route.status >= 200 && route.status < 400 && route.body.includes('generated route:') && route.body.includes('data-test-cookie="works"')) {
      console.log(`Symptom absent: GET /one returned HTTP ${route.status} and rendered the generated route with its request cookie.`)
      result = 1
    } else {
      console.error(`Verification failed: unexpected GET /one response (HTTP ${route.status}).`)
      console.error(logs.slice(-4000))
    }
  }
} catch (error) {
  console.error('Verification failed:', error)
} finally {
  process.exitCode = result
  await stopChild()
}
