import { spawn } from 'node:child_process'
import net from 'node:net'

const host = '127.0.0.1'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) reject(error)
        else if (port === null) reject(new Error('Could not reserve a port'))
        else resolve(port)
      })
    })
  })
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForResponse(url, child, output) {
  const deadline = Date.now() + 120_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (${child.exitCode})\n${output()}`)
    }
    try {
      const response = await fetch(url, { redirect: 'manual' })
      if (response.status > 0) return
    } catch {}
    await sleep(250)
  }
  throw new Error(`Timed out waiting for Next.js\n${output()}`)
}

async function stop(child) {
  if (child.exitCode !== null) return
  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  await Promise.race([exited, sleep(5_000)])
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await Promise.race([exited, sleep(5_000)])
  }
}

let child
let logs = ''
let result = 2

try {
  const port = await reservePort()
  const url = `http://${host}:${port}/test`
  child = spawn('npm', ['run', 'dev', '--', '--hostname', host, '--port', String(port)], {
    cwd: new URL('.', import.meta.url),
    detached: true,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const append = (chunk) => {
    logs += chunk.toString()
    if (logs.length > 20_000) logs = logs.slice(-20_000)
  }
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  await waitForResponse(url, child, () => logs)
  const response = await fetch(url, { redirect: 'manual' })
  const location = response.headers.get('location')

  if (response.status === 200 && location === null) {
    console.log('SYMPTOM_PRESENT: GET /test returned 200 without a redirect; middleware did not match the base-path root.')
    result = 0
  } else if ([301, 302, 303, 307, 308].includes(response.status) && location?.includes('/test/redirected')) {
    console.log(`SYMPTOM_ABSENT: GET /test returned ${response.status} with Location ${location}; middleware matched.`)
    result = 1
  } else {
    console.error(`CHECK_FAILED: unexpected GET /test response: status=${response.status}, location=${location}`)
    console.error(logs)
    result = 2
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}`)
  if (logs) console.error(logs)
  result = 2
} finally {
  process.exitCode = result
  if (child) await stop(child)
}
