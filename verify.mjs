import { spawn } from 'node:child_process'
import process from 'node:process'

const nextBin = process.platform === 'win32'
  ? 'node_modules/.bin/next.cmd'
  : 'node_modules/.bin/next'

const child = spawn(nextBin, ['build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const record = (chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
}
child.stdout.on('data', record)
child.stderr.on('data', record)

let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  process.exitCode = 2
  child.kill('SIGTERM')
}, 180_000)

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timer)

if (timedOut) {
  console.error('Verification failed: next build timed out')
  process.exitCode = 2
} else if (result.error) {
  console.error(`Verification failed to start next build: ${result.error.message}`)
  process.exitCode = 2
} else if (result.code === 0) {
  console.log('Symptom absent: the kebab-case parallel slot compiled successfully')
  process.exitCode = 1
} else {
  const hasParseFailure = /Module parse failed:\s*Unexpected token/i.test(output)
  const identifiesKebabSlot = /parallel-panel/.test(output)

  if (hasParseFailure && identifiesKebabSlot) {
    console.log('Symptom present: generated app-loader code cannot parse the kebab-case parallel slot')
    process.exitCode = 0
  } else {
    console.error(`Verification failed: build exited with ${result.code ?? result.signal} for an unrelated reason`)
    process.exitCode = 2
  }
}
