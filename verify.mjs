import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  encoding: 'utf8',
  timeout: 240_000,
  maxBuffer: 20 * 1024 * 1024,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`)
  process.exitCode = 2
} else if (/TypeError: Cannot read properties of undefined \(reading ['"]entryCSSFiles['"]\)/.test(output)) {
  console.log('Observed issue #73284: next build crashed while reading entryCSSFiles.')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('Issue #73284 absent: next build completed successfully.')
  process.exitCode = 1
} else {
  console.error(`next build failed without the reported entryCSSFiles symptom (exit ${result.status}).`)
  process.exitCode = 2
}
