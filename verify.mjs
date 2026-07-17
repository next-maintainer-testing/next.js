import { spawn } from 'node:child_process'
import { once } from 'node:events'

const cwd = new URL('.', import.meta.url).pathname
const port = 31000 + (process.pid % 10000)
const baseUrl = `http://127.0.0.1:${port}`
let server
let outcome = 2

function spawnProcess(command, args, options = {}) {
  return spawn(command, args, {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

async function runBuild() {
  const child = spawnProcess(process.execPath, ['./node_modules/next/dist/bin/next', 'build'])
  let output = ''
  child.stdout.on('data', (chunk) => { output += chunk })
  child.stderr.on('data', (chunk) => { output += chunk })

  const timer = setTimeout(() => child.kill('SIGKILL'), 240_000)
  const [code, signal] = await once(child, 'exit')
  clearTimeout(timer)
  if (code !== 0) {
    throw new Error(`next build failed (${code ?? signal}):\n${output.slice(-4000)}`)
  }
}

async function waitForServer() {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`next start exited before becoming ready (${server.exitCode})`)
    }
    try {
      const response = await fetch(`${baseUrl}/something`, { redirect: 'manual' })
      if (response.status === 200) return response
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error('next start did not become ready within 45 seconds')
}

async function stopServer() {
  if (!server || server.exitCode !== null) return
  const exited = once(server, 'exit')
  try {
    process.kill(-server.pid, 'SIGTERM')
  } catch {
    server.kill('SIGTERM')
  }
  const timeout = new Promise((resolve) => setTimeout(resolve, 5000, 'timeout'))
  if (await Promise.race([exited.then(() => 'exited'), timeout]) === 'timeout') {
    try {
      process.kill(-server.pid, 'SIGKILL')
    } catch {
      server.kill('SIGKILL')
    }
    await exited
  }
}

try {
  await runBuild()
  server = spawnProcess(
    process.execPath,
    ['./node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    { detached: true },
  )

  const canonical = await waitForServer()
  const canonicalBody = await canonical.text()
  const canonicalCors = canonical.headers.get('access-control-allow-origin')
  if (canonical.status !== 200 || canonicalBody !== 'ok' || canonicalCors !== '*') {
    throw new Error(
      `precondition failed: /something returned status=${canonical.status}, body=${JSON.stringify(canonicalBody)}, access-control-allow-origin=${JSON.stringify(canonicalCors)}`,
    )
  }

  const redirected = await fetch(`${baseUrl}/something/`, { redirect: 'manual' })
  const redirectCors = redirected.headers.get('access-control-allow-origin')
  const location = redirected.headers.get('location')
  if (redirected.status < 300 || redirected.status >= 400 || location !== '/something') {
    throw new Error(
      `unexpected trailing-slash response: status=${redirected.status}, location=${JSON.stringify(location)}`,
    )
  }

  console.log(
    `canonical: status=${canonical.status} cors=${JSON.stringify(canonicalCors)}; trailing slash: status=${redirected.status} location=${JSON.stringify(location)} cors=${JSON.stringify(redirectCors)}`,
  )
  outcome = redirectCors === '*' ? 1 : 0
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  outcome = 2
} finally {
  process.exitCode = outcome
  await stopServer()
}
