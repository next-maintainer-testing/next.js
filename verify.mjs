import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const testFile = 'app/__tests__/example.test.ts'
const source = readFileSync(testFile, 'utf8')
if (!source.includes('const valueThatMustBeAString: string = 123')) {
  console.error(`Check failed: ${testFile} no longer contains the intentional type error`)
  process.exitCode = 2
} else {
  const result = spawnSync(
    process.execPath,
    ['node_modules/next/dist/bin/next', 'build'],
    {
      cwd: process.cwd(),
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  )

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.error) {
    console.error(`Check failed while launching next build: ${result.error.message}`)
    process.exitCode = 2
  } else if (result.status === 0) {
    console.log('SYMPTOM PRESENT: next build succeeded despite the included test-file type error')
    process.exitCode = 0
  } else if (/example\.test\.ts/i.test(output) && /(Type error|not assignable)/i.test(output)) {
    console.log('SYMPTOM ABSENT: next build detected the test-file type error')
    process.exitCode = 1
  } else {
    console.error(`Check failed: next build exited ${result.status} for an unrelated reason`)
    process.exitCode = 2
  }
}
