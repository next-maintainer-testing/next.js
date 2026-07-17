import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 240_000,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const invalidDeleteExport =
  output.includes('has an invalid "DELETE" export') &&
  output.includes('is not a valid type for the function\'s second argument')

if (invalidDeleteExport) {
  console.log('SYMPTOM_PRESENT: next build rejected the DELETE handler context params type.')
  process.exitCode = 0
} else if (result.error) {
  console.error('CHECK_FAILED:', result.error.message)
  console.error(output)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: next build completed successfully.')
  process.exitCode = 1
} else {
  console.error(`CHECK_FAILED: next build exited ${result.status}.`)
  console.error(output)
  process.exitCode = 2
}
