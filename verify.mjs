import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const child = spawn('npm', ['run', 'build'], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
const outputLimit = 2 * 1024 * 1024
const collect = (chunk) => {
  output += chunk.toString()
  if (output.length > outputLimit) output = output.slice(-outputLimit)
}
child.stdout.on('data', collect)
child.stderr.on('data', collect)

let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    child.kill('SIGKILL')
  }
}, 240_000)

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timer)

const tail = output.slice(-8000)
if (timedOut) {
  console.error(`CHECK_FAILED: next build timed out\n${tail}`)
  process.exitCode = 2
} else if (result.error) {
  console.error(`CHECK_FAILED: could not launch next build: ${result.error.message}`)
  process.exitCode = 2
} else if (/RangeError:\s*Maximum call stack size exceeded/i.test(output)) {
  console.log(`SYMPTOM_PRESENT: next build overflowed the call stack while prerendering the recursive component\n${tail}`)
  process.exitCode = 0
} else if (result.code === 0) {
  console.log(`SYMPTOM_ABSENT: next build completed successfully\n${tail}`)
  process.exitCode = 1
} else if (/Component nesting too deep|component (?:that )?recurses infinitely|infinite recursion/i.test(output)) {
  console.log(`SYMPTOM_ABSENT: next build reported a recursion-specific diagnostic\n${tail}`)
  process.exitCode = 1
} else {
  console.error(`CHECK_FAILED: next build failed for an unrelated reason (exit ${result.code}, signal ${result.signal ?? 'none'})\n${tail}`)
  process.exitCode = 2
}
