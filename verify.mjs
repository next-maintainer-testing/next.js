import { spawn } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { once } from 'node:events'

const host = '127.0.0.1'
const projectDir = new URL('.', import.meta.url).pathname
let child = null
let intendedExitCode = 2
let output = ''

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

async function reservePort() {
  const probe = createServer()
  probe.listen(0, host)
  await once(probe, 'listening')
  const address = probe.address()
  const port = typeof address === 'object' && address ? address.port : null
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())))
  if (!port) throw new Error('Could not reserve a local port')
  return port
}

function waitForReady(processHandle) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for custom server startup.\n${output}`)), 120000)

    function onData(chunk) {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
      if (output.includes('Ready on http://')) finish()
    }

    function onExit(code, signal) {
      finish(new Error(`Custom server exited before startup (code ${code}, signal ${signal}).\n${output}`))
    }

    function finish(error) {
      clearTimeout(timeout)
      processHandle.stdout.off('data', onData)
      processHandle.stderr.off('data', onData)
      processHandle.off('exit', onExit)
      if (error) reject(error)
      else resolve()
    }

    processHandle.stdout.on('data', onData)
    processHandle.stderr.on('data', onData)
    processHandle.on('exit', onExit)
  })
}

async function stop(processHandle) {
  if (processHandle.exitCode !== null || processHandle.signalCode !== null) return
  processHandle.kill('SIGTERM')
  const exited = once(processHandle, 'exit').then(() => true)
  const timedOut = new Promise((resolve) => setTimeout(() => resolve(false), 5000))
  if (!(await Promise.race([exited, timedOut]))) {
    processHandle.kill('SIGKILL')
    await once(processHandle, 'exit')
  }
}

try {
  await Promise.all([
    rm(`${projectDir}.next`, { recursive: true, force: true }),
    rm(`${projectDir}.custom_dist`, { recursive: true, force: true }),
  ])

  const port = await reservePort()
  child = spawn(process.execPath, ['server.js'], {
    cwd: projectDir,
    env: { ...process.env, NODE_ENV: 'development', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  await waitForReady(child)
  const response = await fetch(`http://${host}:${port}/`)
  const body = await response.text()
  if (!response.ok || !body.includes('Next.js custom server reproduction')) {
    throw new Error(`Unexpected page response: HTTP ${response.status}`)
  }

  const [defaultDistExists, customDistExists] = await Promise.all([
    exists(`${projectDir}.next`),
    exists(`${projectDir}.custom_dist`),
  ])

  if (defaultDistExists && !customDistExists) {
    console.log('SYMPTOM PRESENT: custom server ignored conf.distDir; .next exists and .custom_dist does not.')
    intendedExitCode = 0
  } else if (customDistExists && !defaultDistExists) {
    console.log('SYMPTOM ABSENT: custom server honored conf.distDir; .custom_dist exists and .next does not.')
    intendedExitCode = 1
  } else {
    throw new Error(`Ambiguous dist directory state: .next=${defaultDistExists}, .custom_dist=${customDistExists}`)
  }
} catch (error) {
  console.error('CHECK FAILED:', error)
  intendedExitCode = 2
} finally {
  process.exitCode = intendedExitCode
  if (child) await stop(child)
}
