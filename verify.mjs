import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

let child
let childExit
let logs = ''

async function cleanup() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    childExit.then(() => true),
    sleep(5000).then(() => false),
  ])
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await childExit
  }
}

try {
  const port = await availablePort()
  const origin = `http://127.0.0.1:${port}`
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')

  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  childExit = new Promise((resolve) => child.once('exit', resolve))
  const capture = (chunk) => {
    logs += chunk.toString()
    if (logs.length > 20000) logs = logs.slice(-20000)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  let html
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before becoming ready.\n${logs}`)
    }
    try {
      const response = await fetch(`${origin}/`)
      if (response.ok) {
        html = await response.text()
        break
      }
      await response.arrayBuffer()
    } catch {}
    await sleep(250)
  }
  if (!html) throw new Error(`Timed out waiting for Next.js.\n${logs}`)

  const match = html.match(/name=["']\$ACTION_ID_([^"']+)["']/)
  if (!match) throw new Error('Rendered form did not expose a Server Action ID')

  const response = await fetch(`${origin}/`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': match[1],
      Origin: origin,
    },
    body: '[]',
  })
  await response.arrayBuffer()

  const actionRedirect = response.headers.get('x-action-redirect')
  const location = response.headers.get('location')
  const symptomPresent = response.status === 303 && actionRedirect === '/destination' && location === null

  console.log(JSON.stringify({
    status: response.status,
    xActionRedirect: actionRedirect,
    location,
    symptomPresent,
  }))
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 2
} finally {
  await cleanup()
}
