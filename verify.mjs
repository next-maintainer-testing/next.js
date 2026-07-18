import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

await rm('.next', { recursive: true, force: true })

const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build'],
  {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

let output = ''
child.stdout.on('data', (chunk) => { output += chunk.toString() })
child.stderr.on('data', (chunk) => { output += chunk.toString() })

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const symptom = '<Html> should not be imported outside of pages/_document.'
if ('error' in result) {
  console.error(`Unable to start next build: ${result.error.message}`)
  process.exitCode = 2
} else if (result.code !== 0 && output.includes(symptom)) {
  console.log('Symptom present: NODE_ENV=development next build failed with the pages/_document <Html> error')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('Symptom absent: NODE_ENV=development next build completed successfully')
  process.exitCode = 1
} else {
  console.error(`Check failed: next build exited ${result.code ?? `on ${result.signal}`}`)
  console.error(output.slice(-6000))
  process.exitCode = 2
}
