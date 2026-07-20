import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import http from 'node:http'

const appPort = 30175
const collectorPort = 4318
const traceRequests = []
let child
let receiver
let logs = ''

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function appendLog(chunk) {
  logs += chunk.toString()
  if (logs.length > 12000) logs = logs.slice(-12000)
}

async function requestPage() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${appPort}/`, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        if (res.statusCode === 200) resolve()
        else reject(new Error(`unexpected page response: ${res.statusCode} ${body.slice(0, 200)}`))
      })
    })
    req.setTimeout(5000, () => req.destroy(new Error('page request timed out')))
    req.on('error', reject)
  })
}

async function waitForPage() {
  const deadline = Date.now() + 90000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with ${child.exitCode}`)
    try {
      await requestPage()
      return
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }
  throw new Error(`next dev did not become ready: ${lastError?.message || 'unknown error'}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(10000).then(() => {
      if (child.exitCode === null) {
        try {
          process.kill(-child.pid, 'SIGKILL')
        } catch {}
      }
    }),
  ])
  if (child.exitCode === null) {
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function closeReceiver() {
  if (!receiver) return
  await new Promise((resolve) => receiver.close(resolve))
}

try {
  await rm('.next', { recursive: true, force: true })

  receiver = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      const body = Buffer.concat(chunks)
      if (req.method === 'POST' && req.url === '/v1/traces' && body.length > 0) {
        traceRequests.push(body.length)
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
  })
  await new Promise((resolve, reject) => {
    receiver.once('error', reject)
    receiver.listen(collectorPort, resolve)
  })

  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-p', String(appPort)], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      OTEL_SERVICE_NAME: 'next-61975-repro',
      OTEL_LOG_LEVEL: 'debug',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', appendLog)
  child.stderr.on('data', appendLog)

  await waitForPage()
  await requestPage()
  await requestPage()
  await delay(12000)
  await stopChild()
  await delay(1000)

  if (traceRequests.length === 0) {
    console.log('SYMPTOM PRESENT: no OTLP trace payload reached /v1/traces after three page renders')
    process.exitCode = 0
  } else {
    console.log(`SYMPTOM ABSENT: received ${traceRequests.length} OTLP trace request(s), ${traceRequests.reduce((a, b) => a + b, 0)} bytes total`)
    process.exitCode = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack || error}`)
  if (logs) console.error(`next dev output:\n${logs}`)
  process.exitCode = 2
} finally {
  await stopChild()
  await closeReceiver()
}
