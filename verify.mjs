import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'

const cwd = process.cwd()
const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next')

function run(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', (error) => resolve({ code: null, output, error }))
    child.on('close', (code) => resolve({ code, output }))
  })
}

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next start exited with ${child.exitCode}`)
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('timed out waiting for next start')
}

async function stop(child) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('close', resolve))
  }
}

let server
let serverOutput = ''
try {
  const build = await run(['build'], { NEXT_TELEMETRY_DISABLED: '1' })
  if (build.code !== 0) {
    console.error(`CHECK_FAILED: next build exited ${build.code}\n${build.output}`)
    process.exitCode = 2
  } else {
    const port = await freePort()
    server = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    server.stdout.on('data', (chunk) => { serverOutput += chunk })
    server.stderr.on('data', (chunk) => { serverOutput += chunk })
    await waitForServer(`http://127.0.0.1:${port}/`, server)

    const response = await fetch(`http://127.0.0.1:${port}/probe`, {
      headers: {
        host: `127.0.0.1:${port}`,
        'x-forwarded-host': `127.0.0.1:${port}`,
        'x-forwarded-proto': 'https'
      }
    })
    const body = await response.json()
    const serialized = JSON.stringify(body)
    const observedOrigin = new URL(body?.origin || 'http://invalid')
    const reproduced = response.status === 500 &&
      observedOrigin.protocol === 'https:' &&
      observedOrigin.port === String(port) &&
      (body?.error?.code === 'ERR_SSL_WRONG_VERSION_NUMBER' ||
       body?.error?.reason === 'wrong version number' ||
       serialized.includes('ERR_SSL_WRONG_VERSION_NUMBER'))

    if (reproduced) {
      console.log(`SYMPTOM_PRESENT: middleware self-fetch to ${body.origin} failed with ${body.error.code || body.error.reason}`)
      process.exitCode = 0
    } else {
      console.log(`SYMPTOM_ABSENT: status=${response.status} body=${serialized}`)
      process.exitCode = 1
    }
  }
} catch (error) {
  console.error(`CHECK_FAILED: ${error.stack || error}\n${serverOutput}`)
  process.exitCode = 2
} finally {
  if (server) await stop(server)
}
