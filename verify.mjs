import { spawn } from 'node:child_process'
import http from 'node:http'
import { once } from 'node:events'

const port = 3000
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const output = []
const server = spawn(process.execPath, [nextBin, 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: new URL('.', import.meta.url).pathname,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

server.stdout.on('data', (chunk) => output.push(chunk.toString()))
server.stderr.on('data', (chunk) => output.push(chunk.toString()))

function requestRedirect() {
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/api',
      method: 'GET',
      headers: { Host: 'example.com:3000' },
    }, (response) => {
      response.resume()
      response.once('end', () => resolve({
        status: response.statusCode,
        location: response.headers.location,
      }))
    })
    request.setTimeout(30_000, () => request.destroy(new Error('request timed out')))
    request.once('error', reject)
    request.end()
  })
}

async function observe() {
  const deadline = Date.now() + 90_000
  let lastError
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next dev exited early with code ${server.exitCode}`)
    }
    try {
      return await requestRedirect()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`server did not become ready: ${lastError?.message ?? 'unknown error'}`)
}

async function stopServer() {
  if (server.exitCode !== null) return
  server.kill('SIGTERM')
  const timer = setTimeout(() => server.kill('SIGKILL'), 10_000)
  try {
    await once(server, 'exit')
  } finally {
    clearTimeout(timer)
  }
}

let result
try {
  const observation = await observe()
  if (observation.status !== 307 || !observation.location) {
    result = { code: 2, message: `unexpected response: ${JSON.stringify(observation)}` }
  } else {
    const location = new URL(observation.location)
    if (location.protocol !== 'https:' || location.hostname !== 'example.com') {
      result = { code: 2, message: `unexpected redirect location: ${observation.location}` }
    } else if (location.port === '3000') {
      result = { code: 0, message: `symptom present: Location is ${observation.location}` }
    } else if (location.port === '') {
      result = { code: 1, message: `symptom absent: Location is ${observation.location}` }
    } else {
      result = { code: 2, message: `unexpected redirect port: ${observation.location}` }
    }
  }
} catch (error) {
  result = { code: 2, message: `verification failed: ${error.stack ?? error}` }
}

process.exitCode = result.code
console.log(result.message)
if (result.code === 2 && output.length) console.error(output.join('').slice(-8000))
await stopServer()
