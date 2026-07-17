import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const host = '127.0.0.1'
const expectedMarker = 'EXTENSION_ALIAS_RESOLVED'
const missingImport = './marker.js'

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
  await Promise.race([
    new Promise((resolve) => child.once('close', resolve)),
    delay(5000).then(() => {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error
      }
    }),
  ])
}

const port = await reservePort()
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-H', host, '-p', String(port)],
  { cwd: process.cwd(), detached: true, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] },
)

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

let observation = null
const deadline = Date.now() + 90000
try {
  while (Date.now() < deadline && observation === null) {
    if (child.exitCode !== null || child.signalCode !== null) break
    try {
      const response = await fetch(`http://${host}:${port}/`)
      const body = await response.text()
      const combined = `${output}\n${body}`
      const reportsMissingImport = combined.includes(missingImport) &&
        /(module not found|can't resolve|cannot find module|failed to resolve)/i.test(combined)
      if (reportsMissingImport) {
        observation = { code: 0, message: `symptom present: Turbopack could not resolve ${missingImport} to marker.ts` }
      } else if (response.ok && body.includes(expectedMarker)) {
        observation = { code: 1, message: `symptom absent: ${missingImport} resolved to marker.ts` }
      } else if (response.status >= 500) {
        observation = { code: 2, message: `check failed: unexpected HTTP ${response.status}` }
      }
    } catch {
      await delay(250)
    }
  }

  if (observation === null) {
    observation = {
      code: 2,
      message: `check failed: dev server exited or timed out; output=${output.slice(-1000)}`,
    }
  }

  process.exitCode = observation.code
  console.log(observation.message)
} finally {
  await stop(child)
}
