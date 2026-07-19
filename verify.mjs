import { spawn } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
let child
let output = ''
let result = 2

const stripAnsi = (value) => value.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  await new Promise((resolve) => {
    const force = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }, 5000)
    child.once('exit', () => {
      clearTimeout(force)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

try {
  const port = await freePort()
  child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => { output += chunk.toString() })
  child.stderr.on('data', (chunk) => { output += chunk.toString() })

  let response
  const deadline = Date.now() + 90000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited before serving a request (${child.exitCode})`)
    try {
      response = await fetch(`http://127.0.0.1:${port}/`)
      break
    } catch {
      await delay(250)
    }
  }
  if (!response) throw new Error('Timed out waiting for Next.js')
  await response.text()
  await delay(1000)

  const clean = stripAnsi(output)
  const hasSerializationError = /Error serializing [`']?\.createdAt[`']? returned from [`']?getServerSideProps[`']?/i.test(clean)
  const identifiesDate = /\[object Date\][\s\S]{0,300}cannot be serialized as JSON/i.test(clean)
  result = response.status === 500 && hasSerializationError && identifiesDate ? 0 : 1
  if (result === 0) {
    console.log('Reproduced: getServerSideProps returned a Date and the request failed with the Next.js Date serialization error.')
  } else {
    console.log(`Not reproduced: HTTP ${response.status}; expected the getServerSideProps Date serialization error.`)
    console.log(clean.slice(-4000))
  }
} catch (error) {
  console.error(`Verification failed: ${error.stack || error}`)
  console.error(stripAnsi(output).slice(-4000))
  result = 2
} finally {
  process.exitCode = result
  await stopChild()
}
