import { spawn } from 'node:child_process'

process.exitCode = 2

const child = spawn('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk.toString()
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  output += chunk.toString()
  process.stderr.write(chunk)
})

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const symptom = /Property ['"]pb-embeddable-form['"] does not exist on type ['"]JSX\.IntrinsicElements['"]/.test(output)

if (symptom) {
  console.log('\nREPRODUCED: the custom element is rejected by JSX.IntrinsicElements.')
  process.exitCode = 0
} else if ('code' in result && result.code === 0) {
  console.log('\nNOT REPRODUCED: the Next.js build accepts the custom element.')
  process.exitCode = 1
} else {
  console.error(`\nCHECK FAILED: build failed without the reported diagnostic (${JSON.stringify(result)}).`)
  process.exitCode = 2
}
