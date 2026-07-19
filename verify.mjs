import { spawn } from 'node:child_process'
import { once } from 'node:events'

const port = 32000 + (process.pid % 1000)
const expected = '<main id="result">module-scope-introspection-works</main>'
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const child = spawn(process.execPath, [nextBin, 'dev', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: new URL('.', import.meta.url),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
child.stdout.on('data', (chunk) => { logs += chunk.toString() })
child.stderr.on('data', (chunk) => { logs += chunk.toString() })

let outcome = 2
try {
  const deadline = Date.now() + 120_000
  let response
  let body = ''

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js exited early with code ${child.exitCode}`)
    }

    try {
      response = await fetch(`http://127.0.0.1:${port}/`)
      body = await response.text()
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  if (!response) {
    throw new Error('Timed out waiting for Next.js')
  }

  if (!response.ok) {
    throw new Error(`Next.js returned HTTP ${response.status}: ${body.slice(0, 500)}`)
  }

  outcome = body.includes(expected) ? 0 : 1
  console.log(outcome === 0
    ? 'Symptom present: a cached function introspected a non-serializable module-scoped class instance.'
    : `Symptom absent: expected runtime marker was not rendered. Body: ${body.slice(0, 500)}`)
} catch (error) {
  console.error(`Verification failed: ${error.message}`)
  console.error(logs.slice(-4000))
  outcome = 2
}

process.exitCode = outcome
if (child.exitCode === null) {
  child.kill('SIGTERM')
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ])
}
