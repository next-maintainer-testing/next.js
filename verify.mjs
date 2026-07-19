import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const EXPECTED = 'Cookies can only be modified in a Server Action or Route Handler'
const host = '127.0.0.1'
let child
let output = ''

async function availablePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

function append(chunk) {
  output += chunk.toString()
  if (output.length > 200_000) output = output.slice(-200_000)
}

async function requestUntilReady(url, deadline) {
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before serving the page (code ${child.exitCode})`)
    }
    try {
      return await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`Next.js did not serve the page: ${lastError}`)
}

async function stop() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await availablePort()
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', host, '--port', String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', append)
  child.stderr.on('data', append)

  const response = await requestUntilReady(`http://${host}:${port}/`, Date.now() + 90_000)
  const body = await response.text()
  await new Promise((resolve) => setTimeout(resolve, 500))
  const reproduced = `${body}\n${output}`.includes(EXPECTED)

  console.log(JSON.stringify({
    status: response.status,
    setCookie: response.headers.get('set-cookie'),
    reproduced,
    expectedMessage: EXPECTED,
  }))
  process.exitCode = reproduced ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  process.exitCode = 2
} finally {
  await stop()
}
