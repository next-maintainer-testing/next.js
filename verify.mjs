import { spawn } from 'node:child_process'
import net from 'node:net'

const symptomPatterns = [
  'Only plain objects, and a few built-ins, can be passed to Client Components from Server Components',
  'Attempted to call a temporary Client Reference from the server',
]

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function freePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function stopProcessGroup(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {}

  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(5000),
  ])

  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {}
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

let child
let result = 2
let observation = 'verification did not complete'

try {
  const port = await freePort()
  child = spawn(
    process.execPath,
    [
      './node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: process.cwd(),
      detached: true,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk.toString() })
  child.stderr.on('data', (chunk) => { logs += chunk.toString() })

  const readyDeadline = Date.now() + 60000
  while (!logs.includes('Ready in') && !logs.includes('Ready in ')) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited before becoming ready (code ${child.exitCode})`)
    }
    if (Date.now() > readyDeadline) throw new Error('Next.js did not become ready within 60 seconds')
    await delay(100)
  }

  let status = null
  let body = ''
  const controller = new AbortController()
  const requestTimer = setTimeout(() => controller.abort(), 40000)
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: controller.signal })
    status = response.status
    body = await response.text()
  } catch (error) {
    if (error?.name !== 'AbortError') throw error
  } finally {
    clearTimeout(requestTimer)
  }

  const diagnosticDeadline = Date.now() + 5000
  while (
    !symptomPatterns.some((pattern) => logs.includes(pattern)) &&
    Date.now() < diagnosticDeadline
  ) {
    await delay(100)
  }

  const diagnostic = symptomPatterns.find((pattern) => logs.includes(pattern))
  const successMarkup = body.includes('<main id="success">cache-result:<!-- -->issue-73094@example.com</main>') ||
    body.includes('<main id="success">cache-result:issue-73094@example.com</main>')

  if (diagnostic) {
    result = 0
    observation = `cache invocation failed with ${JSON.stringify(diagnostic)} (HTTP ${status ?? 'request aborted'})`
  } else if (status === 200 && successMarkup) {
    result = 1
    observation = 'cache invocation completed and rendered the expected email'
  } else {
    result = 2
    observation = `no conclusive cache result (HTTP ${status ?? 'request aborted'})`
  }
} catch (error) {
  result = 2
  observation = error?.stack || String(error)
} finally {
  process.exitCode = result
  if (child) await stopProcessGroup(child)
  console.log(observation)
}
