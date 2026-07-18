import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
})
child.stderr.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stderr.write(text)
})

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

if ('error' in result) {
  console.error(`Failed to launch next build: ${result.error.message}`)
  process.exitCode = 2
} else if (result.signal) {
  console.error(`next build terminated by signal ${result.signal}`)
  process.exitCode = 2
} else if (result.code === 0) {
  console.log('Symptom absent: next build succeeded.')
  process.exitCode = 1
} else if (
  /TypeError:\s*\w+ is not a function/.test(output) &&
  /Failed to collect page data for \/sitemap\/\[__metadata_id__\]/.test(output)
) {
  console.log('Symptom present: commented generateSitemaps made next build create a multi-sitemap route and call a missing function.')
  process.exitCode = 0
} else {
  console.error(`next build failed for an unrelated reason (exit ${result.code}).`)
  process.exitCode = 2
}
