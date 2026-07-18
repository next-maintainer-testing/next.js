import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'

const host = '127.0.0.1'
const logs = []
let server = null
let resultCode = 2
let resultMessage = 'check did not complete'

function remember(chunk) {
  logs.push(chunk.toString())
  if (logs.join('').length > 20000) logs.splice(0, logs.length - 20)
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, host, () => {
      const address = probe.address()
      const port = typeof address === 'object' && address ? address.port : 0
      probe.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function requestPage(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path: '/', timeout: 3000 }, (res) => {
      res.resume()
      res.once('end', () => resolve(res.statusCode))
    })
    req.once('timeout', () => req.destroy(new Error('HTTP request timed out')))
    req.once('error', reject)
  })
}

async function waitForPage(port) {
  const deadline = Date.now() + 90000
  let lastError = new Error('server did not respond')
  while (Date.now() < deadline) {
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`development server exited early: ${server.exitCode ?? server.signalCode}`)
    }
    try {
      const status = await requestPage(port)
      if (status && status < 500) return
      lastError = new Error(`page returned HTTP ${status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw lastError
}

function probeHmrUpgrade(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let response = ''
    let settled = false
    const finish = (outcome) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve({ outcome, response })
    }
    socket.setTimeout(6000)
    socket.once('connect', () => {
      const key = Buffer.from('issue-50461-hmr!').toString('base64')
      socket.write(
        `GET /_next/webpack-hmr HTTP/1.1\r\n` +
        `Host: ${host}:${port}\r\n` +
        `Connection: Upgrade\r\n` +
        `Upgrade: websocket\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n\r\n`
      )
    })
    socket.on('data', (chunk) => {
      response += chunk.toString('latin1')
      if (response.includes('\r\n\r\n')) finish('response')
    })
    socket.once('timeout', () => finish('timeout'))
    socket.once('end', () => finish('closed'))
    socket.once('error', (error) => finish(`error: ${error.message}`))
  })
}

async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  const port = await getFreePort()
  server = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env,
      HOSTNAME: host,
      PORT: String(port),
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', remember)
  server.stderr.on('data', remember)

  await waitForPage(port)
  const probe = await probeHmrUpgrade(port)
  const statusLine = probe.response.split('\r\n', 1)[0]

  if (probe.outcome === 'timeout' && probe.response.length === 0) {
    resultCode = 0
    resultMessage = 'symptom reproduced: /_next/webpack-hmr accepted the TCP connection but sent no WebSocket handshake response for 6 seconds'
  } else if (probe.outcome === 'response' && /^HTTP\/1\.[01] 101\b/.test(statusLine)) {
    resultCode = 1
    resultMessage = `symptom absent: HMR WebSocket upgrade completed (${statusLine})`
  } else {
    resultCode = 2
    resultMessage = `check failed: unexpected HMR upgrade outcome ${probe.outcome}, response ${JSON.stringify(statusLine)}`
  }
} catch (error) {
  resultCode = 2
  resultMessage = `check failed: ${error.stack || error}`
} finally {
  process.exitCode = resultCode
  await stopServer()
  console.log(resultMessage)
  if (resultCode === 2 && logs.length) console.error(logs.join('').slice(-20000))
}
