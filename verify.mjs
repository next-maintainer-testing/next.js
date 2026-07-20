import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const jestBin = require.resolve('jest/bin/jest')
const run = spawnSync(process.execPath, [jestBin, '--runInBand', '--no-cache'], {
  cwd: import.meta.dirname,
  encoding: 'utf8',
  timeout: 240_000,
})

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
const symptom = run.status !== 0 &&
  /chalk[/\\]source[/\\]index\.js/.test(output) &&
  /SyntaxError: Cannot use import statement outside a module/.test(output)

let exitCode
if (run.error) {
  exitCode = 2
} else if (symptom) {
  exitCode = 0
} else if (run.status === 0) {
  exitCode = 1
} else {
  exitCode = 2
}

process.exitCode = exitCode
process.stdout.write(output)
process.stdout.write(`\nverification: ${symptom ? 'reported syntax error observed' : run.status === 0 ? 'Jest successfully imported chalk' : 'unexpected Jest failure'}\n`)
