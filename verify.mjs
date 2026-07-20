import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['run', 'build'], {
  cwd: import.meta.dirname,
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 180_000,
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const symptom = /ReferenceError:\s*require is not defined in ES module scope/.test(output)

if (symptom) {
  console.log('REPRODUCED: next.config.mjs failed because require is unavailable in ES module scope')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('NOT REPRODUCED: the MDX application built successfully')
  process.exitCode = 1
} else {
  console.error('CHECK FAILED: build failed without the reported require-in-ESM error')
  console.error(output.slice(-4000))
  if (result.error) console.error(result.error)
  process.exitCode = 2
}
