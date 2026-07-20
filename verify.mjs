import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
let serverProcess = null

function run(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk
      process.stdout.write(chunk)
    })
    child.stderr.on('data', (chunk) => {
      output += chunk
      process.stderr.write(chunk)
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`next ${args[0]} timed out`))
    }, timeoutMs)
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, signal, output })
    })
  })
}

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      const port = address.port
      socket.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function start(port) {
  serverProcess = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  serverProcess.stdout.pipe(process.stdout)
  serverProcess.stderr.pipe(process.stderr)
}

async function fetchPage(port) {
  const url = `http://127.0.0.1:${port}/`
  let lastError
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return { response, html: await response.text() }
    } catch (error) {
      lastError = error
      if (serverProcess?.exitCode !== null) {
        throw new Error(`next start exited with code ${serverProcess.exitCode}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw lastError ?? new Error('server did not become ready')
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (serverProcess.exitCode === null) serverProcess.kill('SIGKILL')
    }, 5000)
    serverProcess.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    serverProcess.kill('SIGTERM')
  })
}

try {
  const build = await run(['build'], 240_000)
  if (build.code !== 0) {
    throw new Error(`next build failed with code ${build.code ?? build.signal}`)
  }

  const port = await getPort()
  start(port)
  const { response, html } = await fetchPage(port)
  const csp = response.headers.get('content-security-policy') ?? ''
  const nonceMatch = csp.match(/'nonce-([^']+)'/)
  if (!nonceMatch) throw new Error(`response CSP has no nonce: ${csp || '(missing)'}`)

  const nonce = nonceMatch[1]
  const scripts = html.match(/<script\b[^>]*>/gi) ?? []
  if (scripts.length === 0) throw new Error('HTML contained no script tags')
  const matching = scripts.filter((tag) => {
    const match = tag.match(/\bnonce=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
    return (match?.[1] ?? match?.[2] ?? match?.[3]) === nonce
  })

  console.log(`CSP nonce: ${nonce}`)
  console.log(`Generated script tags: ${scripts.length}`)
  console.log(`Script tags carrying the CSP nonce: ${matching.length}`)
  console.log(scripts.join('\n'))

  if (matching.length === 0) {
    console.log('SYMPTOM PRESENT: production scripts omit the response CSP nonce')
    process.exitCode = 0
  } else {
    console.log('SYMPTOM ABSENT: production scripts carry the response CSP nonce')
    process.exitCode = 1
  }
} catch (error) {
  console.error(error?.stack ?? error)
  process.exitCode = 2
} finally {
  await stopServer()
}
