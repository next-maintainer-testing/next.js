import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'

const port = 35643
const root = new URL('.', import.meta.url).pathname
const nextBin = new URL('./node_modules/next/dist/bin/next', import.meta.url).pathname
const preload = new URL('./windows-alias-observer.cjs', import.meta.url).pathname
const nodeOptions = [process.env.NODE_OPTIONS, `--require=${preload}`]
  .filter(Boolean)
  .join(' ')
const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
  cwd: root,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: nodeOptions,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk.toString()
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
})

async function waitForReady() {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`next dev exited before becoming ready (code ${child.exitCode})`)
    }
    if (/ready in|started server on|local:/i.test(output)) return
    await delay(200)
  }
  throw new Error('timed out waiting for next dev')
}

async function stopServer() {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  const graceful = Promise.race([
    once(child, 'exit'),
    delay(5_000).then(() => null),
  ])
  const result = await graceful
  if (result === null && child.exitCode === null) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

let code = 2
try {
  await waitForReady()
  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { 'cache-control': 'no-cache' },
  })
  const html = await response.text()
  await delay(500)

  const invariant = /invariant expected app router to be mounted/i.test(output)
  const errorDocument = /<html[^>]*id=["']__next_error__["']/i.test(html)
  const symptom = invariant || errorDocument

  console.log(JSON.stringify({
    status: response.status,
    invariant,
    errorDocument,
    symptom,
  }))
  if (invariant) {
    console.log('Observed: invariant expected app router to be mounted')
  }
  code = symptom ? 0 : 1
} catch (error) {
  console.error(error instanceof Error ? error.stack : String(error))
  console.error(output.slice(-4000))
  code = 2
} finally {
  process.exitCode = code
  await stopServer()
}
