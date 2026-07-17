import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const workspace = path.dirname(fileURLToPath(import.meta.url))
const tsc = path.join(workspace, 'node_modules', 'typescript', 'bin', 'tsc')
const result = spawnSync(process.execPath, [tsc, '--project', 'tsconfig.json', '--pretty', 'false'], {
  cwd: workspace,
  encoding: 'utf8',
  timeout: 120_000,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const expected = /probe\.tsx\(7,9\): error TS2322: Type 'void' is not assignable to type 'Promise<void>'\./

if (result.error) {
  console.error(`TypeScript probe failed to execute: ${result.error.message}`)
  process.exitCode = 2
} else if (result.status === 0) {
  console.log('Symptom absent: useRouter().push is assignable to Promise<void>.')
  process.exitCode = 1
} else if (result.status === 2 && expected.test(output)) {
  console.log('Symptom present: useRouter().push returns void rather than Promise<void>.')
  console.log(output.trim())
  process.exitCode = 0
} else {
  console.error('TypeScript probe failed with an unexpected diagnostic.')
  console.error(output.trim())
  process.exitCode = 2
}
