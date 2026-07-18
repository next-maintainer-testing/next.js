import { spawnSync } from 'node:child_process'

const result = spawnSync('script', ['-q', '-e', '-c', 'npm run lint', '/dev/null'], {
  cwd: new URL('.', import.meta.url),
  encoding: 'utf8',
  env: { ...process.env, CI: '1', NO_COLOR: '1', NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(`lint command failed: ${result.error.message}`)
  process.exitCode = 2
} else if (result.status !== 0) {
  console.error(`lint command exited unexpectedly with status ${result.status}`)
  process.exitCode = 2
} else {
  const hasWarning =
    output.includes('WARNING: You are currently running a version of TypeScript which is not officially supported by @typescript-eslint/typescript-estree.') &&
    output.includes('SUPPORTED TYPESCRIPT VERSIONS: >=4.7.4 <5.5.0') &&
    output.includes('YOUR TYPESCRIPT VERSION: 5.7.3')
  process.exitCode = hasWarning ? 0 : 1
}
