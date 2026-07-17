import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import process from 'node:process'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill('SIGTERM')
  const exited = new Promise((resolve) => child.once('exit', resolve))
  await Promise.race([exited, delay(5000)])
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

const port = await freePort()
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

let observation
let failure
const deadline = Date.now() + 120_000

try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Next.js exited before the probe (code=${child.exitCode}, signal=${child.signalCode})`)
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/probe`)
      const text = await response.text()
      if (response.status === 500 && /cache[\s\S]{0,200}is not a function/i.test(text)) {
        observation = { cacheUnavailable: true }
        break
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${text}`)
      observation = JSON.parse(text)
      break
    } catch (error) {
      failure = error
      await delay(500)
    }
  }

  if (!observation) {
    throw new Error(`Probe did not succeed: ${failure?.message || 'timed out'}`)
  }

  if (observation.cacheUnavailable === true) {
    console.log('SYMPTOM_PRESENT React cache() is unavailable in middleware')
    process.exitCode = 0
  } else if (observation.calls === 2 && observation.sameResult === false) {
    console.log(`SYMPTOM_PRESENT calls=${observation.calls} sameResult=${observation.sameResult}`)
    process.exitCode = 0
  } else if (observation.calls === 1 && observation.sameResult === true) {
    console.log(`SYMPTOM_ABSENT calls=${observation.calls} sameResult=${observation.sameResult}`)
    process.exitCode = 1
  } else {
    throw new Error(`Unexpected middleware observation: ${JSON.stringify(observation)}`)
  }
} catch (error) {
  console.error(`CHECK_FAILED ${error.stack || error}`)
  console.error(output.slice(-8000))
  process.exitCode = 2
} finally {
  await stop(child)
}
