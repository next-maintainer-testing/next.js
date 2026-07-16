import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import net from 'node:net'

const instrumentationPath = new URL('./instrumentation.js', import.meta.url)
const originalInstrumentation = await readFile(instrumentationPath, 'utf8')
let child
let output = ''
let outcome = 2
let detail = 'verification did not complete'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function waitFor(label, predicate, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    if (child.exitCode !== null) throw new Error(`dev server exited before ${label} (code ${child.exitCode})`)
    await delay(200)
  }
  return false
}

async function requestPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/`)
  await response.text()
  if (!response.ok) throw new Error(`page request failed with HTTP ${response.status}`)
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  const force = delay(5000).then(() => {
    if (child.exitCode === null) child.kill('SIGKILL')
  })
  await Promise.race([exited, force])
  if (child.exitCode === null) await exited
}

try {
  const port = await freePort()
  child = spawn(process.execPath, [
    './node_modules/next/dist/bin/next',
    'dev',
    '--hostname', '127.0.0.1',
    '--port', String(port),
  ], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const collect = (chunk) => {
    const text = chunk.toString()
    output += text
    process.stdout.write(text)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)

  const sawInitialNode = await waitFor(
    'the initial Node.js instrumentation load',
    () => output.includes('instrumentation runtime nodejs'),
  )
  if (!sawInitialNode) throw new Error('timed out waiting for the initial Node.js instrumentation load')

  await requestPage(port)
  const initializedEdge = await waitFor(
    'the initial Edge middleware instrumentation load',
    () => output.includes('instrumentation runtime edge'),
    30000,
  )
  if (!initializedEdge) throw new Error('timed out initializing Edge middleware instrumentation')

  const beforeReload = output.length
  await writeFile(instrumentationPath, `${originalInstrumentation}\n// verifier reload ${Date.now()}\n`)
  await delay(1000)
  await requestPage(port)

  await waitFor('instrumentation hot reload output', () => {
    const reloadOutput = output.slice(beforeReload)
    return reloadOutput.includes('instrumentation runtime edge') ||
      reloadOutput.includes('instrumentation runtime nodejs')
  }, 15000)

  const reloadOutput = output.slice(beforeReload)
  if (reloadOutput.includes('instrumentation runtime edge')) {
    outcome = 0
    detail = 'symptom present: after instrumentation.js changed, it ran again with NEXT_RUNTIME=edge'
  } else {
    outcome = 1
    detail = 'symptom absent: after instrumentation.js changed, it did not run again with NEXT_RUNTIME=edge'
  }
} catch (error) {
  outcome = 2
  detail = `check failed: ${error.stack || error}`
} finally {
  process.exitCode = outcome
  try {
    await writeFile(instrumentationPath, originalInstrumentation)
  } catch (error) {
    process.exitCode = 2
    detail += `; failed to restore instrumentation.js: ${error.message}`
  }
  await stopChild()
  console.log(`VERIFY_RESULT: ${detail}`)
}
