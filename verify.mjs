import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import process from 'node:process'

const marker = 'REPRO_77436: DATABASE_URL is required while initializing the auth database adapter'
const env = { ...process.env }
delete env.DATABASE_URL

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
})
child.stderr.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stderr.write(text)
})

let timedOut = false
const timeout = setTimeout(() => {
  timedOut = true
  child.kill('SIGTERM')
}, 240_000)

const result = await new Promise((resolve) => {
  child.on('error', (error) => resolve({ error }))
  child.on('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timeout)

if (timedOut || result.error) {
  console.error(timedOut ? 'Verification timed out' : result.error)
  process.exitCode = 2
} else if (result.code !== 0 && output.includes(marker)) {
  console.log('Observed issue #77436: force-dynamic route initialization required DATABASE_URL during next build.')
  process.exitCode = 0
} else if (result.code === 0 && !output.includes(marker)) {
  console.log('Issue #77436 was absent: next build completed without initializing the force-dynamic route.')
  process.exitCode = 1
} else {
  console.error(`Verification failed unexpectedly (code=${result.code}, signal=${result.signal ?? 'none'}).`)
  process.exitCode = 2
}
