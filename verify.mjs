import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const host = '127.0.0.1'
const expected = ['id-1', 'id-2', 'id-3', 'id-4']
let child
let outcome = 2

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function getPage(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (response.ok) return await response.text()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await delay(500)
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    })
  ])
  if (child.exitCode === null) {
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      delay(2000)
    ])
  }
}

try {
  const port = await reservePort()
  if (!port) throw new Error('Could not reserve a local port')

  const nextBin = path.join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'next.cmd' : 'next')
  child = spawn(nextBin, ['dev', '-H', host, '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let logs = ''
  const capture = (chunk) => {
    logs = (logs + chunk.toString()).slice(-12000)
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)

  const html = await getPage(`http://${host}:${port}/`, 120000)
  const actual = [...html.matchAll(/<script\b[^>]*\bid=["'](id-[1-4])["'][^>]*>/gi)].map((match) => match[1])

  if (actual.length !== expected.length || new Set(actual).size !== expected.length) {
    throw new Error(`Could not observe each test script exactly once; found [${actual.join(', ')}]\n${logs}`)
  }

  const symptomPresent = actual.some((id, index) => id !== expected[index])
  console.log(`Expected source order: ${expected.join(', ')}`)
  console.log(`Rendered script order: ${actual.join(', ')}`)
  console.log(symptomPresent ? 'Symptom present: rendered order differs from source order.' : 'Symptom absent: rendered order matches source order.')
  outcome = symptomPresent ? 0 : 1
} catch (error) {
  console.error(`Verification failed: ${error.stack || error}`)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopChild()
}
