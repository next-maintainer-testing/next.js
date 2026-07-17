import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })
rmSync('out', { recursive: true, force: true })

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  encoding: 'utf8',
  timeout: 280_000,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error || result.signal || result.status === null) {
  console.error(`Verification command failed: ${result.error?.message ?? result.signal ?? 'no exit status'}`)
  process.exitCode = 2
} else if (result.status === 0) {
  console.error('Symptom absent: static export build succeeded.')
  process.exitCode = 1
} else {
  const normalized = output.replaceAll('\\', '/')
  const hasReportedEnoent =
    normalized.includes('ENOENT') &&
    normalized.includes('.next/export/500.html') &&
    normalized.includes('.next/server/pages/500.html')

  if (hasReportedEnoent) {
    console.error('Symptom present: static export failed while moving the generated 500 page.')
    process.exitCode = 0
  } else {
    console.error(`Check failed: next build exited ${result.status} without the reported 500-page ENOENT.`)
    process.exitCode = 2
  }
}
