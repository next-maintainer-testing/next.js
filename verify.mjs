import { spawn } from 'node:child_process'
import http from 'node:http'

const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const port = 41000 + (process.pid % 10000)
let server = null
let serverOutput = ''
let resultCode = 2

function runNext(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: new URL('.', import.meta.url),
      stdio: 'inherit',
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`next ${args[0]} timed out`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`next ${args[0]} failed (code=${code}, signal=${signal})`))
    })
  })
}

function request(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { hostname: '127.0.0.1', port, path: pathname },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => {
          resolve({
            status: response.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        })
      },
    )
    request.setTimeout(5000, () => request.destroy(new Error('request timed out')))
    request.once('error', reject)
  })
}

async function waitUntilReady() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited early (${server.exitCode})\n${serverOutput}`)
    }
    try {
      const response = await request('/')
      if (response.status === 200) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`next start did not become ready\n${serverOutput}`)
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise((resolve) => server.once('close', () => resolve(true))),
    new Promise((resolve) => setTimeout(() => resolve(false), 5000)),
  ])
  if (!exited && server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('close', resolve))
  }
}

try {
  await runNext(['build'], 240000)

  server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: new URL('.', import.meta.url),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [server.stdout, server.stderr]) {
    stream.on('data', (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-12000)
    })
  }
  await waitUntilReady()

  const rawAmpersand = await request('/About%20STAR%20&%20HPI%20(09-2024).pdf')
  const encodedAmpersand = await request('/About%20STAR%20%26%20HPI%20(09-2024).pdf')

  console.log(JSON.stringify({
    rawAmpersandStatus: rawAmpersand.status,
    encodedAmpersandStatus: encodedAmpersand.status,
  }))

  if (encodedAmpersand.status !== 200 || !encodedAmpersand.body.startsWith('%PDF-1.1')) {
    throw new Error('encoded fixture URL was not served correctly')
  }
  resultCode = rawAmpersand.status === 404 ? 0 : rawAmpersand.status === 200 ? 1 : 2
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  resultCode = 2
} finally {
  process.exitCode = resultCode
  await stopServer()
}
