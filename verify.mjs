import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const symptom = "ESM packages (date-fns) need to be imported. Use 'import' to reference the package instead."

rmSync('.next', { recursive: true, force: true })
const result = spawnSync(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  encoding: 'utf8',
  timeout: 240_000,
})
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(result.error)
  process.exitCode = 2
} else if (output.includes(symptom)) {
  process.exitCode = 0
} else if (result.status === 0) {
  process.exitCode = 1
} else {
  console.error(`Build failed without the reported symptom (exit ${result.status}).`)
  process.exitCode = 2
}
