import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: next build resolved the TypeScript file imported with a .js specifier')
  process.exitCode = 1
} else if (/Module not found:[\s\S]*Can't resolve ['"]\.\/message\.js['"]/.test(output)) {
  console.log('SYMPTOM_PRESENT: next build could not resolve ./message.js to app/message.ts')
  process.exitCode = 0
} else {
  console.error(`CHECK_FAILED: next build exited ${result.status}, but not with the reported module-resolution error`)
  process.exitCode = 2
}
