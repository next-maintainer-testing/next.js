import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', NO_COLOR: '1' },
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
let timedOut = false
let spawnFailed = false

function collect(chunk) {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
}

child.stdout.on('data', collect)
child.stderr.on('data', collect)

const timeout = setTimeout(() => {
  timedOut = true
  if (child.pid && process.platform !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {}
  } else {
    child.kill('SIGTERM')
  }
}, 240_000)

await new Promise((resolve) => {
  child.once('error', (error) => {
    output += `\nUnable to run next build: ${error.message}\n`
    spawnFailed = true
    resolve()
  })
  child.once('close', resolve)
})

clearTimeout(timeout)

const hashedWarning = /Unexpected token Function\(["']var["']\) at static\/css\/[0-9a-f]+\.css:\d+:\d+/.test(output)
const warningNamesSource = /Unexpected token Function\(["']var["']\)[^\n]*(?:app\/example\.scss|example\.scss)/.test(output)

if (timedOut || spawnFailed) {
  console.error('Verification failed: next build did not complete normally.')
  process.exitCode = 2
} else if (hashedWarning && !warningNamesSource) {
  console.log('Reproduced: CSS warning identifies only a hashed static/css asset, not app/example.scss.')
  process.exitCode = 0
} else {
  console.log('Not reproduced: the unclear hashed-only CSS warning was absent.')
  process.exitCode = 1
}
