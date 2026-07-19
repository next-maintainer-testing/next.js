import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'

const marker = 'issue-50320-visible-content'
const logs = []
let child

function remember(chunk) {
  logs.push(String(chunk))
  if (logs.join('').length > 12000) logs.shift()
}

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

function requestPage(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      hostname: '127.0.0.1',
      port,
      path: '/',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-encoding': 'gzip, deflate, br',
        'user-agent': 'Mozilla/5.0 issue-50320-verifier',
      },
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }))
    })
    request.setTimeout(10000, () => request.destroy(new Error('HTTP request timed out')))
    request.on('error', reject)
  })
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const closed = new Promise((resolve) => child.once('close', resolve))
  await Promise.race([closed, delay(5000)])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('close', resolve))
  }
}

try {
  const port = await availablePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', remember)
  child.stderr.on('data', remember)

  const deadline = Date.now() + 120000
  let result
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js dev server exited with code ${child.exitCode}`)
    try {
      result = await requestPage(port)
      break
    } catch (error) {
      lastError = error
      await delay(250)
    }
  }
  if (!result) throw new Error(`Next.js dev server was not reachable: ${lastError?.message ?? 'timeout'}`)
  if (result.status !== 200) throw new Error(`Unexpected HTTP status ${result.status}; body=${result.body.toString('utf8').slice(0, 500)}`)

  const text = result.body.toString('utf8')
  if (result.body.length === 0) {
    console.log(`SYMPTOM_PRESENT: HTTP 200 response body is empty; headers=${JSON.stringify(result.headers)}`)
    process.exitCode = 0
  } else if (text.includes(marker)) {
    console.log(`SYMPTOM_ABSENT: HTTP 200 response contains the expected marker (${result.body.length} bytes)`)
    process.exitCode = 1
  } else {
    throw new Error(`HTTP 200 response was nonempty but lacked the expected marker (${result.body.length} bytes)`)
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack ?? error}`)
  console.error(logs.join('').slice(-12000))
  process.exitCode = 2
} finally {
  await stopChild()
}
