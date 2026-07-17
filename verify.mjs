import { spawn } from 'node:child_process'
import net from 'node:net'

const symptom = /Unexpected MODIFIER at \d+, expected END/
const expectedLocation = 'https://www.example.com/#/login?return=something'
let child
let output = ''

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function request(url) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
  const body = await response.text()
  return {
    status: response.status,
    location: response.headers.get('location'),
    body,
  }
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false
    try {
      const response = await request(baseUrl)
      if (response.status > 0) return true
    } catch {}
    await delay(250)
  }
  return false
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const graceful = await Promise.race([exited.then(() => true), delay(10_000).then(() => false)])
  if (!graceful && child.exitCode === null) {
    child.kill('SIGKILL')
    await exited
  }
}

try {
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const ready = await waitForServer(baseUrl)
  if (!ready) {
    await delay(500)
    if (symptom.test(output)) {
      console.log('SYMPTOM PRESENT: Next.js failed while loading the redirect with:', output.match(symptom)[0])
      process.exitCode = 0
    } else {
      console.error('CHECK FAILED: Next.js dev server did not become ready.\n' + output)
      process.exitCode = 2
    }
  } else {
    const response = await request(`${baseUrl}/redirect`)
    await delay(1_000)
    const evidence = `${output}\n${response.body}`
    if (symptom.test(evidence)) {
      console.log(`SYMPTOM PRESENT: /redirect returned HTTP ${response.status} and Next.js emitted ${evidence.match(symptom)[0]}`)
      process.exitCode = 0
    } else if ((response.status === 307 || response.status === 308) && response.location === expectedLocation) {
      console.log(`SYMPTOM ABSENT: /redirect returned HTTP ${response.status} with Location: ${response.location}`)
      process.exitCode = 1
    } else {
      console.error(`CHECK FAILED: unexpected HTTP ${response.status}, Location: ${response.location}\n${evidence}`)
      process.exitCode = 2
    }
  }
} catch (error) {
  console.error('CHECK FAILED:', error)
  process.exitCode = 2
} finally {
  await stopChild()
}
