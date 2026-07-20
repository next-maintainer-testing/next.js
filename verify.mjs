import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const run = (script, args) =>
  spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
  })
const outputOf = (result) => `${result.stdout || ''}${result.stderr || ''}`

const eslint = run(
  path.join(root, 'node_modules/eslint/bin/eslint.js'),
  ['app/page.js']
)
const eslintOutput = outputOf(eslint)

if (eslint.error || eslint.signal || eslint.status !== 1 || !/prettier\/prettier/.test(eslintOutput)) {
  console.error('CHECK_FAILED: direct ESLint did not report the fixture Prettier violation')
  console.error(eslintOutput)
  process.exitCode = 2
} else {
  const nextLint = run(
    path.join(root, 'node_modules/next/dist/bin/next'),
    ['lint']
  )
  const nextOutput = outputOf(nextLint)

  if (nextLint.error || nextLint.signal || nextLint.status === null) {
    console.error('CHECK_FAILED: next lint could not be executed')
    console.error(nextOutput)
    process.exitCode = 2
  } else if (nextLint.status === 0) {
    console.log('SYMPTOM_PRESENT: direct ESLint reports the app/page.js Prettier error, but next lint exits successfully')
    console.log(nextOutput)
    process.exitCode = 0
  } else if (/prettier\/prettier/.test(nextOutput)) {
    console.log('SYMPTOM_ABSENT: next lint reports the app/page.js Prettier error')
    console.log(nextOutput)
    process.exitCode = 1
  } else if (/Invalid project directory|unknown command|Unknown command|does not exist/i.test(nextOutput) && /lint/i.test(nextOutput)) {
    console.log('SYMPTOM_ABSENT: the current Next.js CLI no longer provides the next lint command, so the reported silent-success behavior does not occur')
    console.log(nextOutput)
    process.exitCode = 1
  } else {
    console.error('CHECK_FAILED: next lint failed for an unrelated reason')
    console.error(nextOutput)
    process.exitCode = 2
  }
}
