import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const output = []

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => {
  output.push(chunk)
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  output.push(chunk)
  process.stderr.write(chunk)
})

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const text = Buffer.concat(output).toString()
const expectedFailure =
  result.code !== 0 &&
  text.includes("Cannot read properties of undefined (reading '0')") &&
  (text.includes('HookWebpackError') || text.includes('cssnano-simple'))

if (expectedFailure) {
  console.log('REPRODUCED: next build failed while processing the escaped-space CSS selector')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('NOT REPRODUCED: next build completed successfully')
  process.exitCode = 1
} else {
  console.error(`CHECK FAILED: next build exited unexpectedly (${result.error ?? `code ${result.code}, signal ${result.signal}`})`)
  process.exitCode = 2
}
