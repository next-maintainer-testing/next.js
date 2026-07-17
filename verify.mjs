import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'

const port = 20000 + (process.pid % 20000)
const output = []
let child

function waitForPort(timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ host: '127.0.0.1', port })
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) reject(new Error('Next.js dev server did not listen in time'))
        else setTimeout(attempt, 50)
      })
    }
    attempt()
  })
}

function requestRedirect() {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: '127.0.0.1',
      port,
      path: '/redirect',
      headers: { accept: 'text/html' },
    }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        rawHeaders: response.rawHeaders,
        body: Buffer.concat(chunks).toString('utf8'),
      }))
    })
    request.setTimeout(120000, () => request.destroy(new Error('Request timed out')))
    request.on('error', reject)
  })
}

function stopServer() {
  if (!child || child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

try {
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  await waitForPort(120000)
  const response = await requestRedirect()
  const setCookies = []
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    if (response.rawHeaders[index].toLowerCase() === 'set-cookie') {
      setCookies.push(response.rawHeaders[index + 1])
    }
  }
  const targetCookies = setCookies.filter((value) => value.startsWith('middleware-cookie='))
  console.log(JSON.stringify({ statusCode: response.statusCode, setCookies, targetCookieCount: targetCookies.length }, null, 2))

  if (![303, 307, 308].includes(response.statusCode)) {
    console.error('Check failed: /redirect did not return a redirect response')
    process.exitCode = 2
  } else if (targetCookies.length > 1) {
    console.log('Symptom present: middleware cookie is duplicated on the redirect response')
    process.exitCode = 0
  } else {
    console.log('Symptom absent: middleware cookie appears at most once on the redirect response')
    process.exitCode = 1
  }
} catch (error) {
  console.error(error)
  console.error(output.join(''))
  process.exitCode = 2
} finally {
  await stopServer()
}
