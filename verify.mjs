import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const expected = 'assetPrefix must start with a leading slash or be an absolute URL(http:// or https://)'
const timeoutMs = 240_000

await rm('.next', { recursive: true, force: true })
await rm('out', { recursive: true, force: true })

let output = ''
let timedOut = false
const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', chunk => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on('data', chunk => {
  output += chunk
  process.stderr.write(chunk)
})

const timer = setTimeout(() => {
  timedOut = true
  child.kill('SIGTERM')
}, timeoutMs)

const result = await new Promise(resolve => {
  child.on('error', error => resolve({ error }))
  child.on('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timer)

if (timedOut || result.error) {
  console.error(timedOut ? 'Verification timed out' : `Could not run next build: ${result.error.message}`)
  process.exitCode = 2
} else if (result.code !== 0 && output.includes(expected)) {
  console.log('Observed next/font rejecting the relative assetPrefix "./".')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('Build succeeded; the reported symptom is absent.')
  process.exitCode = 1
} else {
  console.error(`Build failed without the reported assetPrefix error (code=${result.code}, signal=${result.signal}).`)
  process.exitCode = 2
}

await rm('.next', { recursive: true, force: true })
await rm('out', { recursive: true, force: true })
