import http from 'node:http'
import net from 'node:net'
import { spawn } from 'node:child_process'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function request(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port, path: '/api/test' }, (res) => {
      res.resume()
      res.once('end', () => resolve({ statusCode: res.statusCode, rawHeaders: res.rawHeaders }))
    })
    req.setTimeout(10_000, () => req.destroy(new Error('request timed out')))
    req.once('error', reject)
  })
}

const output = []
let child
let resultCode = 2

try {
  const port = await freePort()
  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => output.push(chunk.toString()))
  child.stderr.on('data', (chunk) => output.push(chunk.toString()))

  let response
  let lastError
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with code ${child.exitCode}`)
    try {
      response = await request(port)
      break
    } catch (error) {
      lastError = error
      await sleep(250)
    }
  }
  if (!response) throw lastError ?? new Error('Next.js did not become ready')
  if (response.statusCode !== 200) throw new Error(`Unexpected HTTP status ${response.statusCode}`)

  const setCookies = []
  for (let index = 0; index < response.rawHeaders.length; index += 2) {
    if (response.rawHeaders[index].toLowerCase() === 'set-cookie') setCookies.push(response.rawHeaders[index + 1])
  }
  const hasFirst = setCookies.some((value) => value.includes('Domain=.example1.com'))
  const hasSecond = setCookies.some((value) => value.includes('Domain=.example2.com'))
  const symptomPresent = setCookies.length !== 2 || !hasFirst || !hasSecond

  console.log(JSON.stringify({
    symptomPresent,
    setCookieHeaderCount: setCookies.length,
    setCookies,
  }))
  resultCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error?.stack || String(error))
  console.error(output.join('').slice(-8000))
  resultCode = 2
}

process.exitCode = resultCode
if (child && child.exitCode === null) {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(10_000).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) await new Promise((resolve) => child.once('exit', resolve))
}
