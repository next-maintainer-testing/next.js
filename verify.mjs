import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function availablePort() {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

const port = await availablePort()
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let output = ''
let exited = false
const exitedPromise = new Promise((resolve) => {
  child.once('exit', (code, signal) => {
    exited = true
    resolve({ code, signal })
  })
})
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

let responseText = null
let failure = null
const deadline = Date.now() + 120_000

while (Date.now() < deadline && !exited) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`)
    if (response.ok) {
      responseText = await response.text()
      break
    }
  } catch {
    // The development server is still starting.
  }
  await delay(250)
}

if (responseText === null) {
  const status = exited ? await exitedPromise : { code: null, signal: null }
  failure = `server did not return / successfully (exit=${status.code}, signal=${status.signal})`
} else {
  await delay(500)
}

const mainReturned = responseText?.includes('MAIN_ROUTE_RENDERED') === true
const authReturned = responseText?.includes('AUTH_ROUTE_RENDERED') === true
const mainExecuted = output.includes('MAIN_ROUTE_EXECUTED')
const authExecuted = output.includes('AUTH_PARALLEL_ROUTE_EXECUTED')

if (failure || !mainReturned || authReturned || !mainExecuted) {
  process.exitCode = 2
  console.error(failure ?? 'the control route did not render and execute as expected')
} else if (authExecuted) {
  process.exitCode = 0
  console.log('SYMPTOM_PRESENT: the unselected @auth route executed while the response rendered only the main route')
} else {
  process.exitCode = 1
  console.log('SYMPTOM_ABSENT: only the selected main route executed')
}

console.log(JSON.stringify({ mainReturned, authReturned, mainExecuted, authExecuted }))

if (!exited) {
  child.kill('SIGTERM')
  let timer
  await Promise.race([
    exitedPromise,
    new Promise((resolve) => { timer = setTimeout(resolve, 5_000) }),
  ])
  if (timer) clearTimeout(timer)
}
if (!exited) {
  child.kill('SIGKILL')
  await exitedPromise
}
