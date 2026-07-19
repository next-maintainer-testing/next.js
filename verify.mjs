import { spawnSync } from 'node:child_process'

const result = spawnSync(
  process.execPath,
  ['./node_modules/typescript/bin/tsc', '--project', 'tsconfig.json', '--pretty', 'false'],
  { cwd: process.cwd(), encoding: 'utf8', timeout: 120_000 }
)

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const missingGlobals = ['describe', 'test', 'expect'].filter((name) =>
  new RegExp(`Cannot find name '${name}'`).test(output)
)

if (result.error) {
  console.error(`TypeScript check failed to execute: ${result.error.message}`)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('Jest globals are recognized; the reported symptom is absent.')
  process.exitCode = 1
} else if (missingGlobals.length === 3) {
  console.log('TypeScript reports that describe, test, and expect are unknown without @types/jest.')
  console.log(output.trim())
  process.exitCode = 0
} else {
  console.error('TypeScript failed, but not with the complete reported missing-Jest-globals symptom.')
  console.error(output.trim())
  process.exitCode = 2
}
