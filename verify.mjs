import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
})
const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

const missingGenMapping = /Cannot find module ['"][^'"\n]*node_modules[\\/]@jridgewell[\\/]gen-mapping[\\/]dist[\\/]gen-mapping\.umd\.js['"]/.test(output)
const nextFontFailure = /An error occurred in [`']next\/font[`']/.test(output)

if (result.error) {
  console.error(`Verification command failed: ${result.error.message}`)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('Reported next/font build failure is absent.')
  process.exitCode = 1
} else if (missingGenMapping && nextFontFailure) {
  console.log('Observed the reported next/font build failure caused by missing gen-mapping dist output.')
  process.exitCode = 0
} else {
  console.error(`Build failed for an unrelated reason (exit ${result.status}).`)
  process.exitCode = 2
}
