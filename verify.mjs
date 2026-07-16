import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(result.error)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: Next.js resolved ./Form.jsx to app/Form.tsx')
  process.exitCode = 1
} else if (/Module not found|Can't resolve/.test(output) && output.includes('./Form.jsx')) {
  console.log('SYMPTOM_PRESENT: Next.js failed to resolve ./Form.jsx to app/Form.tsx')
  process.exitCode = 0
} else {
  console.error(`CHECK_FAILED: build exited ${result.status} without the reported module-resolution error`)
  process.exitCode = 2
}
