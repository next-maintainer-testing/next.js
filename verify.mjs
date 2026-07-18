import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { rm } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const nextPackage = require('next/package.json')
const nextBin = require.resolve('next/dist/bin/next')
const major = Number.parseInt(nextPackage.version.split('.')[0], 10)
const args = [nextBin, 'build']
if (major >= 16) args.push('--webpack')

await rm('.next', { recursive: true, force: true })

const result = await new Promise((resolve) => {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
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
  child.on('error', (error) => resolve({ code: null, output, error }))
  child.on('close', (code) => resolve({ code, output, error: null }))
})

const warning = /\[BABEL\] Note: The code generator has deoptimised the styling of .*generated\.js as it exceeds the max of 500KB/.test(result.output)
if (result.error || result.code !== 0) {
  console.error(`Verification failed: next build exited with ${result.code}`, result.error ?? '')
  process.exitCode = 2
} else if (warning) {
  console.log('SYMPTOM_PRESENT: Babel emitted the >500KB deoptimised-styling warning despite compact=true.')
  process.exitCode = 0
} else {
  console.log('SYMPTOM_ABSENT: Build completed without the Babel >500KB deoptimised-styling warning.')
  process.exitCode = 1
}

await rm('.next', { recursive: true, force: true })
