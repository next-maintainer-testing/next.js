import { spawn } from 'node:child_process'

const port = 32140
const origin = `http://127.0.0.1:${port}`
let output = ''
let server

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  server.kill('SIGTERM')
  const exited = new Promise((resolve) => server.once('exit', resolve))
  await Promise.race([exited, delay(5000)])
  if (server.exitCode === null) {
    server.kill('SIGKILL')
    await Promise.race([exited, delay(5000)])
  }
}

try {
  server = spawn(process.execPath, [
    'node_modules/next/dist/bin/next',
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  server.stdout.on('data', (chunk) => { output += chunk })
  server.stderr.on('data', (chunk) => { output += chunk })

  const deadline = Date.now() + 120000
  let response
  let lastError

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before the check (code ${server.exitCode})\n${output}`)
    }
    try {
      response = await fetch(`${origin}/example`, { redirect: 'manual' })
      break
    } catch (error) {
      lastError = error
      await delay(500)
    }
  }

  if (!response) {
    throw new Error(`Next.js did not become ready: ${lastError}\n${output}`)
  }

  const body = await response.text()
  const location = response.headers.get('location')
  console.log(JSON.stringify({ status: response.status, location, body }))

  if (response.status === 404 && body === 'caught redirect' && location === null) {
    process.exitCode = 0
  } else if (response.status >= 300 && response.status < 400 && location) {
    process.exitCode = 1
  } else {
    console.error(`Unexpected response; check could not classify behavior.\n${output}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  await stopServer()
}
