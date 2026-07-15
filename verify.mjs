import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build', '--turbopack'],
  { cwd: process.cwd(), encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
)

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error || result.status === null) {
  console.error(result.error ?? 'The Next.js build did not return an exit status.')
  process.exitCode = 2
} else if (result.status !== 0 && output.includes('TypeError: this.emitFile is not a function')) {
  console.log('REPRODUCED: file-loader crashed because this.emitFile is unavailable.')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('NOT REPRODUCED: the Turbopack build succeeded.')
  process.exitCode = 1
} else {
  console.error('CHECK FAILED: the build failed without the reported this.emitFile diagnostic.')
  process.exitCode = 2
}
