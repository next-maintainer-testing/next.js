import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const tsc = fileURLToPath(new URL('./node_modules/typescript/bin/tsc', import.meta.url))
const result = spawnSync(process.execPath, [tsc, '--noEmit', '--pretty', 'false'], {
  cwd: fileURLToPath(new URL('.', import.meta.url)),
  encoding: 'utf8',
  timeout: 120_000,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
const symptom = /error TS2307: Cannot find module ['"]next\/head['"] or its corresponding type declarations\./.test(output)

if (result.error) {
  process.exitCode = 2
  console.error(`TypeScript check failed to run: ${result.error.message}`)
} else if (symptom) {
  process.exitCode = 0
  console.log('Reproduced: TypeScript cannot resolve next/head under NodeNext module resolution.')
  console.log(output.trim())
} else if (result.status === 0) {
  process.exitCode = 1
  console.log('Not reproduced: TypeScript resolved next/head without diagnostics.')
} else {
  process.exitCode = 2
  console.error(`TypeScript failed with unexpected diagnostics (exit ${result.status}).`)
  console.error(output.trim())
}
