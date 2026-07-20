import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => child.once('close', resolve))
  await Promise.race([closed, sleep(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await Promise.race([closed, sleep(2000)])
  }
}

const port = await freePort()
const origin = `http://127.0.0.1:${port}`
let output = ''
const child = spawn(process.execPath, [
  'node_modules/next/dist/bin/next',
  'dev',
  '--hostname', '127.0.0.1',
  '--port', String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, APP_ORIGIN: origin, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output = (output + chunk.toString()).slice(-20000)
  })
}

let code = 2
try {
  const deadline = Date.now() + 120000
  let ready = false
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${child.exitCode ?? child.signalCode})`)
    }
    try {
      const response = await fetch(`${origin}/result?internalSetCookie=probe`)
      if (response.ok) {
        ready = true
        break
      }
    } catch {}
    await sleep(500)
  }
  if (!ready) throw new Error('Timed out waiting for Next.js')

  const response = await fetch(`${origin}/auth?tokenAccess=1234`, {
    redirect: 'manual',
  })
  const location = response.headers.get('location') || ''
  const outerSetCookie = response.headers.get('set-cookie')
  const internalRouteSetCookie = location.includes('internalSetCookie=yes')
  const redirected = response.status >= 300 && response.status < 400

  if (redirected && internalRouteSetCookie && outerSetCookie === null) {
    console.log(`SYMPTOM PRESENT: internal Route Handler response set a cookie, but GET /auth returned ${response.status} without Set-Cookie (${location})`)
    code = 0
  } else {
    console.log(`SYMPTOM ABSENT: status=${response.status} location=${location || '<none>'} outerSetCookie=${outerSetCookie || '<none>'}`)
    code = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  console.error(output)
  code = 2
} finally {
  process.exitCode = code
  await stop(child)
}
