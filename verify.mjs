import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:net'

const root = new URL('.', import.meta.url)
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let nextServer = null

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} exited with ${code ?? signal}`))
    })
  })
}

async function getPort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  if (!port) throw new Error('Could not reserve a local port')
  return port
}

async function waitForServer(url, child, output) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited early with ${child.exitCode}\n${output.text}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for Next.js server\n${output.text}`)
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

try {
  await rm(new URL('.next', root), { recursive: true, force: true })
  await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'])

  const manifest = JSON.parse(await readFile(new URL('.next/server/server-reference-manifest.json', root), 'utf8'))
  const actionIds = Object.keys(manifest.node ?? {})
  if (actionIds.length !== 1) {
    throw new Error(`Expected exactly one built Server Action, found ${actionIds.length}`)
  }

  const port = await getPort()
  const output = { text: '' }
  nextServer = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  for (const stream of [nextServer.stdout, nextServer.stderr]) {
    stream.on('data', (chunk) => {
      output.text += chunk.toString()
      if (output.text.length > 20_000) output.text = output.text.slice(-20_000)
    })
  }

  const url = `http://127.0.0.1:${port}/`
  await waitForServer(url, nextServer, output)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'text/x-component',
      'Content-Type': 'text/plain;charset=UTF-8',
      'Next-Action': actionIds[0],
    },
    body: '[]',
  })
  const body = await response.text()

  if (!response.ok || !body.includes('pong')) {
    throw new Error(`Server Action request failed: status=${response.status}, body=${body.slice(0, 500)}`)
  }

  const middlewareHeader = response.headers.get('x-server-action-middleware')
  if (middlewareHeader === 'observed') {
    console.log(`SYMPTOM PRESENT: Server Action POST passed through middleware (status ${response.status}, x-server-action-middleware=${middlewareHeader}, action returned pong).`)
    process.exitCode = 0
  } else {
    console.log(`SYMPTOM ABSENT: Server Action returned pong but middleware marker was missing (status ${response.status}).`)
    process.exitCode = 1
  }
} catch (error) {
  console.error(`CHECK FAILED: ${error.stack ?? error}`)
  process.exitCode = 2
} finally {
  await stopServer(nextServer)
}
