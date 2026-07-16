import { spawn } from 'node:child_process'

const child = spawn(
  process.execPath,
  ['--input-type=module', '--eval', "import { configs } from '@next/eslint-plugin-next'; void configs"],
  { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
)

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })

const result = await new Promise((resolve) => {
  child.on('error', (error) => resolve({ error }))
  child.on('close', (code, signal) => resolve({ code, signal }))
})

if (result.error || result.signal) {
  console.error(result.error ?? `child terminated by ${result.signal}`)
  process.exitCode = 2
} else if (result.code === 0) {
  console.log('Named ESM import of configs succeeded; symptom absent.')
  process.exitCode = 1
} else if (
  stderr.includes("Named export 'configs' not found") &&
  stderr.includes("'@next/eslint-plugin-next'")
) {
  console.log("Named ESM import failed with 'configs' not found; symptom present.")
  process.exitCode = 0
} else {
  console.error('Import failed for an unexpected reason.')
  if (stdout) console.error(stdout)
  if (stderr) console.error(stderr)
  process.exitCode = 2
}
