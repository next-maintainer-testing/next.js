import { spawn } from 'node:child_process'
import net from 'node:net'

let server = null
let desiredExitCode = 2

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run(command, args, timeoutMs) {
  const child = spawn(command, args, {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGKILL')
  }, timeoutMs)
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  clearTimeout(timer)
  return { code, output, timedOut }
}

async function availablePort() {
  const socket = net.createServer()
  await new Promise((resolve, reject) => {
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', resolve)
  })
  const address = socket.address()
  const port = address.port
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitUntilReady(getOutput, child, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (/Ready in|started server|Local:/i.test(getOutput())) return
    if (child.exitCode !== null) throw new Error(`next start exited early with ${child.exitCode}`)
    await delay(100)
  }
  throw new Error('Timed out waiting for next start')
}

async function rawDuplicateHeaderRequest(port) {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    let response = ''
    socket.setEncoding('utf8')
    socket.setTimeout(15000)
    socket.once('connect', () => {
      socket.write([
        'GET /sitemap/test HTTP/1.1',
        `Host: localhost:${port}`,
        'X-Forwarded-Proto: https',
        'X-Forwarded-Proto: https',
        'Connection: close',
        '',
        '',
      ].join('\r\n'))
    })
    socket.on('data', (chunk) => { response += chunk })
    socket.once('end', () => resolve(response))
    socket.once('timeout', () => {
      socket.destroy()
      reject(new Error('Timed out waiting for HTTP response'))
    })
    socket.once('error', reject)
  })
}

async function stopServer(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const stopped = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(5000).then(() => false),
  ])
  if (!stopped && child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

async function verify() {
  const build = await run(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], 180000)
  if (build.timedOut || build.code !== 0) {
    console.error('Verification failed during next build')
    console.error(build.output)
    return 2
  }

  const port = await availablePort()
  let serverOutput = ''
  server = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString() })
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString() })

  await waitUntilReady(() => serverOutput, server, 60000)
  const response = await rawDuplicateHeaderRequest(port)
  await delay(250)

  const status = Number(response.match(/^HTTP\/1\.[01] (\d{3})/m)?.[1])
  const routeCalled = serverOutput.includes('ISSUE_58914_ROUTE_BODY_CALLED')
  const invalidUrl = /TypeError: Invalid URL|ERR_INVALID_URL/.test(serverOutput)
  const duplicateBase = /base:\s*['"]https, https:\/\//.test(serverOutput)
  const successfulRoute = status === 200 && response.includes('route-called:/sitemap/test') && routeCalled

  if (status === 500 && invalidUrl && duplicateBase && !routeCalled) {
    console.log('SYMPTOM_PRESENT: duplicate x-forwarded-proto produced an invalid https, https:// base before the route body ran')
    return 0
  }
  if (successfulRoute) {
    console.log('SYMPTOM_ABSENT: the route body ran and returned HTTP 200 with duplicate x-forwarded-proto headers')
    return 1
  }

  console.error('CHECK_FAILED: response and server output did not match either expected state')
  console.error(`HTTP status: ${Number.isFinite(status) ? status : 'unparsed'}`)
  console.error(response)
  console.error(serverOutput)
  return 2
}

try {
  desiredExitCode = await verify()
} catch (error) {
  console.error('CHECK_FAILED:', error?.stack || error)
  desiredExitCode = 2
} finally {
  process.exitCode = desiredExitCode
  if (server) await stopServer(server)
}
