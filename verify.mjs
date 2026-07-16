import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
child.stdout.on('data', (chunk) => { output += chunk; process.stdout.write(chunk) })
child.stderr.on('data', (chunk) => { output += chunk; process.stderr.write(chunk) })

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const symptom = result.code !== 0 &&
  output.includes('Could not parse module') &&
  output.includes('app-router-context.js') &&
  output.includes('Failed to collect page data for /a')

if (symptom) {
  process.exitCode = 0
} else if (result.code === 0) {
  process.exitCode = 1
} else {
  console.error('Build failed without the reported MODULE_UNPARSABLE symptom:', result)
  process.exitCode = 2
}
