import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const cwd = process.cwd()
const logFile = path.join(cwd, 'cache-handler.jsonl')
const env = {
  ...process.env,
  CACHE_HANDLER_LOG: logFile,
  NEXT_TELEMETRY_DISABLED: '1',
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject)
    child.on('exit', (code, signal) => resolve({ code, signal, output }))
  })
}

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer()
    socket.on('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close(() => resolve(address.port))
    })
  })
}

function hasExited(child) {
  return child.exitCode !== null || child.signalCode !== null
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (hasExited(child)) {
      throw new Error(`Next.js server exited early (${child.exitCode ?? child.signalCode})\n${output()}`)
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) })
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for Next.js server\n${output()}`)
}

async function stopServer(child) {
  if (!child || hasExited(child)) return
  try { process.kill(-child.pid, 'SIGTERM') } catch {}
  const deadline = Date.now() + 5_000
  while (!hasExited(child) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!hasExited(child)) {
    const exited = new Promise((resolve) => {
      if (hasExited(child)) resolve()
      else child.once('exit', resolve)
    })
    try { process.kill(-child.pid, 'SIGKILL') } catch {}
    await exited
  }
}

let server
let result = 2
try {
  fs.rmSync(logFile, { force: true })
  const build = await run('npm', ['run', 'build'])
  if (build.code !== 0) {
    throw new Error(`next build failed (${build.code ?? build.signal})\n${build.output}`)
  }

  fs.rmSync(logFile, { force: true })
  const port = await getPort()
  let serverOutput = ''
  server = spawn('npm', ['run', 'start', '--', '-p', String(port)], {
    cwd,
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  server.stdout.on('data', (chunk) => { serverOutput += chunk })
  server.stderr.on('data', (chunk) => { serverOutput += chunk })

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForServer(baseUrl, server, () => serverOutput)
  fs.writeFileSync(logFile, '')

  const response = await fetch(`${baseUrl}/api/revalidate`, {
    signal: AbortSignal.timeout(30_000),
  })
  const body = await response.text()
  if (!response.ok || !body.includes('"revalidated":true')) {
    throw new Error(`On-demand revalidation failed: HTTP ${response.status} ${body}\n${serverOutput}`)
  }

  const records = fs.readFileSync(logFile, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const methods = records.map((record) => record.method)
  if (!methods.includes('get') || !methods.includes('set')) {
    throw new Error(`Revalidation did not exercise CacheHandler.get and CacheHandler.set: ${JSON.stringify(records)}`)
  }

  if (methods.includes('revalidateTag')) {
    console.log(`Symptom absent: revalidateTag was called. Records: ${JSON.stringify(records)}`)
    result = 1
  } else {
    console.log(`Symptom reproduced: revalidation called get/set but not revalidateTag. Records: ${JSON.stringify(records)}`)
    result = 0
  }
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  result = 2
} finally {
  process.exitCode = result
  await stopServer(server)
}
