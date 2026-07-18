import { rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

rmSync(join(process.cwd(), '.next'), { recursive: true, force: true })

const nextBin = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next')
if (!existsSync(nextBin)) {
  console.error('Verification failed: Next.js binary is not installed')
  process.exitCode = 2
} else {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    timeout: 240_000,
  })

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.error) {
    console.error(`Verification failed to execute build: ${result.error.message}`)
    process.exitCode = 2
  } else if (result.status === 0) {
    console.log('Symptom absent: next/font accepted static template literals')
    process.exitCode = 1
  } else if (/Font loader values must be explicitly written literals/i.test(output)) {
    console.log('Symptom present: next/font rejected static template literals')
    process.exitCode = 0
  } else {
    console.error(`Verification inconclusive: build failed with status ${result.status}`)
    process.exitCode = 2
  }
}
