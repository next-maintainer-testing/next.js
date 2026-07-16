import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 270_000,
})

const output = `${result.stdout || ''}\n${result.stderr || ''}`
const symptom = output.includes('Cannot access .then on the server') &&
  output.includes('You cannot dot into a client module from a server component')

if (symptom) {
  process.exitCode = 0
  console.log('REPRODUCED: build failed while prerendering because the re-exported client layout was treated as a server component.')
} else if (result.status === 0) {
  process.exitCode = 1
  console.log('ABSENT: next build completed successfully.')
} else {
  process.exitCode = 2
  console.error(`CHECK_FAILED: next build exited ${result.status ?? result.signal ?? 'unknown'} without the reported diagnostic.`)
  console.error(output.slice(-8000))
}
