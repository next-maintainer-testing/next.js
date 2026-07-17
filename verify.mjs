import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { rm } from 'node:fs/promises'

const cwd = new URL('.', import.meta.url).pathname
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }
let serverProcess = null

function run(command, args, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: null, output: `${output}\n${error.stack ?? error}` })
    })
    child.on('exit', (code, signal) => {
      clearTimeout(timer)
      resolve({ code, output: `${output}\nexit=${code} signal=${signal}` })
    })
  })
}

function getPort() {
  return new Promise((resolve, reject) => {
    const socket = createServer()
    socket.once('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      socket.close((error) => error ? reject(error) : resolve(address.port))
    })
  })
}

async function waitForRoute(url, child, logs) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next start exited early with ${child.exitCode}\n${logs()}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return await response.json()
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`timed out waiting for ${url}\n${logs()}`)
}

async function stopServer() {
  if (!serverProcess || serverProcess.exitCode !== null) return
  const exited = new Promise((resolve) => serverProcess.once('exit', resolve))
  serverProcess.kill('SIGTERM')
  const stopped = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
  ])
  if (!stopped && serverProcess.exitCode === null) {
    serverProcess.kill('SIGKILL')
    await exited
  }
}

let result = 2
try {
  await rm(new URL('.next', import.meta.url), { recursive: true, force: true })
  const build = await run(process.execPath, ['node_modules/next/dist/bin/next', 'build'], 180_000)
  if (build.code !== 0) {
    throw new Error(`next build failed\n${build.output}`)
  }

  const port = await getPort()
  let startLogs = ''
  serverProcess = spawn(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  serverProcess.stdout.on('data', (chunk) => { startLogs += chunk })
  serverProcess.stderr.on('data', (chunk) => { startLogs += chunk })

  const observation = await waitForRoute(
    `http://127.0.0.1:${port}/api/workflow-name`,
    serverProcess,
    () => startLogs,
  )
  if (observation.expected !== 'temporalWorkflow' || typeof observation.actual !== 'string') {
    throw new Error(`invalid route observation: ${JSON.stringify(observation)}`)
  }

  const symptomPresent = observation.actual !== observation.expected
  console.log(JSON.stringify({ symptomPresent, ...observation }))
  result = symptomPresent ? 0 : 1
} catch (error) {
  console.error(error.stack ?? error)
  result = 2
}

process.exitCode = result
await stopServer()
