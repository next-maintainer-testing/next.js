import { spawn } from 'node:child_process'
import net from 'node:net'

const cwd = new URL('.', import.meta.url).pathname
let child
let outcome = 2
let detail = 'verification did not complete'

async function availablePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function stopChild() {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
  if (child.exitCode === null) {
    child.kill('SIGKILL')
    await new Promise((resolve) => child.once('exit', resolve))
  }
}

try {
  const port = await availablePort()
  const logs = []
  child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port)], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  const deadline = Date.now() + 120000
  let response
  let body = ''
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Next.js exited early with ${child.exitCode}: ${logs.join('').slice(-4000)}`)
    try {
      response = await fetch(`http://127.0.0.1:${port}/`)
      body = await response.text()
      if (response.status === 200 && body.includes('issue 44654 reproduction')) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (!response || response.status !== 200 || !body.includes('issue 44654 reproduction')) {
    throw new Error(`Page was not served successfully: ${logs.join('').slice(-4000)}`)
  }

  const middlewareHeader = response.headers.get('x-issue-44654-middleware')
  if (middlewareHeader === 'ran') {
    outcome = 1
    detail = 'symptom absent: middleware.ts ran and added its response header'
  } else {
    outcome = 0
    detail = 'symptom present: page loaded but middleware.ts did not add its response header'
  }
} catch (error) {
  outcome = 2
  detail = `check failed: ${error?.stack || error}`
} finally {
  process.exitCode = outcome
  await stopChild()
  console.log(detail)
}
