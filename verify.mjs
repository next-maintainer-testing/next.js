import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import net from 'node:net'
import process from 'node:process'

const cwd = process.cwd()

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : null
      server.close((error) => {
        if (error) reject(error)
        else if (port === null) reject(new Error('Could not allocate a port'))
        else resolve(port)
      })
    })
  })
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve()

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    }, timeoutMs)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function fetchRuntimeObservation(url, child) {
  const deadline = Date.now() + 60_000
  let lastError

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Standalone server exited before observation (code=${child.exitCode}, signal=${child.signalCode})`)
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3_000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  throw new Error(`Timed out waiting for runtime route: ${lastError}`)
}

let server

try {
  await rm(new URL('./.next', import.meta.url), { recursive: true, force: true })

  const build = await run(
    process.execPath,
    ['./node_modules/next/dist/bin/next', 'build'],
    {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      CIRCLE_NODE_TOTAL: '2',
    },
  )

  if (build.code !== 0) {
    throw new Error(`next build failed (code=${build.code}, signal=${build.signal})`)
  }

  const port = await reservePort()
  server = spawn(process.execPath, ['.next/standalone/server.js'], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      CIRCLE_NODE_TOTAL: '9',
    },
    stdio: 'inherit',
  })

  const observation = await fetchRuntimeObservation(
    `http://127.0.0.1:${port}/api/cpus`,
    server,
  )
  console.log(`Runtime observation: ${JSON.stringify(observation)}`)

  if (
    observation.runtimeCircleNodeTotal !== 9 ||
    observation.expectedRuntimeCpus !== 8
  ) {
    throw new Error(`Runtime route returned an invalid observation: ${JSON.stringify(observation)}`)
  }

  const symptomPresent = observation.configuredCpus === 1
  process.exitCode = symptomPresent ? 0 : 1
  console.log(
    symptomPresent
      ? 'Symptom present: standalone runtime uses the build-time CPU value 1 instead of runtime value 8.'
      : `Symptom absent: standalone runtime did not use the build-time CPU value (configuredCpus=${observation.configuredCpus}).`,
  )
} catch (error) {
  process.exitCode = 2
  console.error(error)
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGTERM')
    await waitForExit(server, 5_000)
  }
}
