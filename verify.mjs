import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

const reservePort = () => new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    server.close((error) => error ? reject(error) : resolve(address.port))
  })
})

const port = await reservePort()
const child = spawn(process.execPath, [
  './node_modules/next/dist/bin/next', 'dev', '-H', '127.0.0.1', '-p', String(port),
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const deadline = Date.now() + 90_000
let response
try {
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited early with ${child.exitCode}\n${output}`)
    }
    try {
      response = await fetch(`http://127.0.0.1:${port}/proxy`)
      if (response.ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (!response?.ok) throw new Error(`Next.js did not serve the reproduction\n${output}`)
  await response.text()

  const observed = {
    added: response.headers.get('x-added-header'),
    existing: response.headers.get('x-existing-header'),
    remove: response.headers.get('x-remove-header'),
  }
  console.log(JSON.stringify({ status: response.status, headers: observed }))

  const symptomPresent =
    observed.added === 'middleware-added' &&
    observed.existing === 'upstream-original' &&
    observed.remove === 'upstream-remove'
  const expectedBehavior =
    observed.added === 'middleware-added' &&
    observed.existing === 'middleware-replacement' &&
    observed.remove === null

  process.exitCode = symptomPresent ? 0 : expectedBehavior ? 1 : 2
} catch (error) {
  console.error(error)
  process.exitCode = 2
} finally {
  child.kill('SIGTERM')
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve()
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 5_000)
    child.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}
