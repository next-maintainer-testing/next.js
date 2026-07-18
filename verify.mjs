import { spawn } from 'node:child_process'

const port = 34186
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--turbopack', '-p', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    output += chunk.toString()
    if (output.length > 20000) output = output.slice(-20000)
  })
}

const closed = new Promise((resolve) => child.once('close', resolve))
let observation
let exitCode = 2

try {
  const deadline = Date.now() + 120000
  let lastError
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`next dev exited early with code ${child.exitCode}`)
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/resolve`)
      if (response.ok) {
        observation = await response.json()
        break
      }
      lastError = new Error(`HTTP ${response.status}: ${await response.text()}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  if (!observation) throw lastError ?? new Error('Timed out waiting for the route')

  const synthetic = observation.resolved.includes('[project]')
  const missing = observation.exists === false
  console.log(JSON.stringify({ observation, symptomPresent: synthetic && missing }))
  exitCode = synthetic && missing ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(output)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (child.exitCode === null) child.kill('SIGTERM')
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 10000)).then(() => {
      if (child.exitCode === null) child.kill('SIGKILL')
    }),
  ])
  if (child.exitCode === null) await closed
}
