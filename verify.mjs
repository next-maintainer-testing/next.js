import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
rmSync('.next', { recursive: true, force: true })

const result = spawnSync(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'build'],
  {
    cwd: process.cwd(),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    timeout: 240_000,
  },
)

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(`Build check failed to execute: ${result.error.message}`)
  process.exitCode = 2
} else {
  const hasExportMismatch =
    output.includes("The provided export path '/blog/test-1'") &&
    output.includes("doesn't match the '/[lang]/blog/[slug]/page' page")

  if (result.status !== 0 && hasExportMismatch) {
    console.log('SYMPTOM_PRESENT: default-locale path was stripped during app-route prerendering')
    process.exitCode = 0
  } else if (result.status === 0) {
    console.log('SYMPTOM_ABSENT: next build completed successfully')
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED: build exited ${result.status} without the reported export-path mismatch`)
    process.exitCode = 2
  }
}
