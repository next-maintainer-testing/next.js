import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = await import.meta.resolve('next/dist/bin/next')
const nextPath = new URL(nextBin).pathname
const output = []

function record(chunk) {
  output.push(String(chunk))
  if (output.length > 200) output.shift()
}

function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextPath, ...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', record)
    child.stderr.on('data', record)
    const timer = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error(`next ${args[0]} timed out`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal })
    })
  })
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited early with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      await response.arrayBuffer()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  throw new Error('next start did not become ready')
}

let server
let finalCode = 2
try {
  const built = await run(['build'], 180_000)
  if (built.code !== 0) throw new Error(`next build failed (${built.code ?? built.signal})`)

  const port = await availablePort()
  server = spawn(process.execPath, [nextPath, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', record)
  server.stderr.on('data', record)
  await waitForServer(`http://127.0.0.1:${port}/`, server)

  const response = await fetch(`http://127.0.0.1:${port}/example`, { redirect: 'manual' })
  const body = await response.text()
  const cacheControl = response.headers.get('cache-control')
  const reachedNotFound = body.includes('ISSUE_76168_CUSTOM_NOT_FOUND')

  console.log(JSON.stringify({ status: response.status, cacheControl, reachedNotFound }))
  if (!reachedNotFound) {
    throw new Error(`rewrite did not reach the custom not-found response (status ${response.status})`)
  }
  finalCode = cacheControl === null ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(output.join('').slice(-8000))
  finalCode = 2
} finally {
  process.exitCode = finalCode
  if (server && server.exitCode === null) {
    server.kill('SIGTERM')
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL')
      }, 5_000)
      server.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
