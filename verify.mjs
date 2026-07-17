import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const output = []
let child
let timer

try {
  await rm('.next', { recursive: true, force: true })

  child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--turbopack'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    process.stdout.write(chunk)
    output.push(chunk.toString())
  })
  child.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
    output.push(chunk.toString())
  })

  timer = setTimeout(() => child.kill('SIGTERM'), 240_000)
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })

  const log = output.join('')
  const routeConstraint = /RouteHandlerConfig<[^>]*\/api\/route\/\[id\][^>]*>/i.test(log)
  const promiseParams = /params:\s*Promise<\{\s*id:\s*string;?\s*\}>/i.test(log)
  const incompatible = /Types? of (?:property|parameters?).*(?:POST|context)|not assignable/i.test(log)

  if (result.code !== 0 && routeConstraint && promiseParams && incompatible) {
    console.log('\nVERIFICATION: reported route-handler params type mismatch reproduced')
    process.exitCode = 0
  } else if (result.code === 0) {
    console.log('\nVERIFICATION: build succeeded; reported symptom absent')
    process.exitCode = 1
  } else {
    console.error(`\nVERIFICATION: build failed without the reported symptom (code=${result.code}, signal=${result.signal})`)
    process.exitCode = 2
  }
} catch (error) {
  console.error('\nVERIFICATION: check failed', error)
  process.exitCode = 2
} finally {
  if (timer) clearTimeout(timer)
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM')
    await new Promise((resolve) => child.once('close', resolve))
  }
}
