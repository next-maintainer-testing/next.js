import { spawn } from 'node:child_process'
import { access, rm } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const marker = path.join(root, '.db-query-ran-during-build')
await rm(marker, { force: true })
await rm(path.join(root, '.next'), { recursive: true, force: true })

let timedOut = false
const child = spawn('npm', ['run', 'build'], {
  cwd: root,
  env: { ...process.env, DB_PROBE_FILE: marker },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  output += chunk
  process.stderr.write(chunk)
})

const timer = setTimeout(() => {
  timedOut = true
  child.kill('SIGTERM')
}, 240_000)

const code = await new Promise((resolve) => child.once('close', resolve))
clearTimeout(timer)

let queryRan = false
try {
  await access(marker)
  queryRan = true
} catch {}

if (queryRan) {
  console.log('SYMPTOM_PRESENT: a use-cache database query executed during next build')
  process.exitCode = 0
} else if (!timedOut && code === 0) {
  console.log('SYMPTOM_ABSENT: the use-cache database query did not execute during next build')
  process.exitCode = 1
} else {
  console.error(`CHECK_FAILED: next build exited with ${code}${timedOut ? ' after timeout' : ''}`)
  if (output.includes('DB_PROBE_FILE')) {
    console.error('The build mentioned the probe environment unexpectedly.')
  }
  process.exitCode = 2
}

await rm(marker, { force: true })
await rm(path.join(root, '.next'), { recursive: true, force: true })
