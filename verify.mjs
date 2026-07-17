import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

const expected =
  result.status !== 0 &&
  output.includes('RouteHandlerConfig<"/api/items/[id]">') &&
  output.includes('params: Promise<{ id: string; }>') &&
  output.includes("params: { id: string; }")

if (expected) {
  console.log('SYMPTOM_PRESENT: next build rejects a synchronous dynamic route params signature')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: next build accepted the synchronous dynamic route params signature')
  process.exitCode = 1
} else {
  console.error(`CHECK_FAILED: build exited with ${result.status ?? result.signal}`)
  process.exitCode = 2
}
