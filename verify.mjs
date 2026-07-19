import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const port = 35829
const baseUrl = `http://127.0.0.1:${port}`
let server
let finalCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error(`${command} failed (${signal ?? code})`))
      } else {
        resolve()
      }
    })
  })
}

async function readRuntimeEnv() {
  let lastError
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/env`)
      if (response.ok) return await response.json()
      lastError = new Error(`HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw lastError ?? new Error('standalone server did not become ready')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

try {
  await rm('.next', { recursive: true, force: true })
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
    env: { ...process.env, NODE_ENV: 'test', NEXT_TELEMETRY_DISABLED: '1' },
  })

  server = spawn(process.execPath, ['.next/standalone/server.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.pipe(process.stdout)
  server.stderr.pipe(process.stderr)
  server.once('error', (error) => console.error(error))

  const payload = await readRuntimeEnv()
  console.log(`Standalone runtime NODE_ENV=${JSON.stringify(payload.nodeEnv)}`)
  if (payload.nodeEnv === 'production') {
    console.log('SYMPTOM_PRESENT: standalone server overwrote NODE_ENV=test with production')
    finalCode = 0
  } else if (payload.nodeEnv === 'test') {
    console.log('SYMPTOM_ABSENT: standalone server preserved NODE_ENV=test')
    finalCode = 1
  } else {
    console.error(`CHECK_FAILED: unexpected NODE_ENV value ${JSON.stringify(payload.nodeEnv)}`)
    finalCode = 2
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  await stopServer()
}
