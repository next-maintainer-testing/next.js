import { spawn } from 'node:child_process'
import net from 'node:net'

const expectedLine = 4
const timeoutMs = 120_000
let child
let output = ''

function getPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function stopServer() {
  if (!child || child.exitCode !== null) return

  const exited = new Promise((resolve) => child.once('exit', resolve))
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
  }

  const stopped = await Promise.race([
    exited.then(() => true),
    delay(5_000).then(() => false),
  ])

  if (!stopped && child.exitCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
    await exited
  }
}

async function run() {
  const port = await getPort()
  child = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  const deadline = Date.now() + timeoutMs
  let response
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js dev server exited with code ${child.exitCode}\n${output}`)
    }

    try {
      response = await fetch(`http://127.0.0.1:${port}/api/test-pages`)
      if (response.ok) break
    } catch {
      // The server is still starting.
    }
    await delay(500)
  }

  if (!response?.ok) {
    throw new Error(`Timed out waiting for /api/test-pages\n${output}`)
  }
  await response.text()
  await delay(1_000)

  const matches = [...output.matchAll(/src\/pages\/api\/test-pages\.ts:(\d+):(\d+)/g)]
  if (matches.length === 0) {
    throw new Error(`The triggered Error stack did not reference its TypeScript source file\n${output}`)
  }

  const observed = matches.at(-1)
  const observedLine = Number(observed[1])
  const observedColumn = Number(observed[2])
  console.log(`Error stack points to src/pages/api/test-pages.ts:${observedLine}:${observedColumn}; Error was created on line ${expectedLine}.`)
  return observedLine === expectedLine ? 1 : 0
}

let code = 2
try {
  code = await run()
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
}

process.exitCode = code
await stopServer()
