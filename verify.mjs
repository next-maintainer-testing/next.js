import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
child.stdout.on('data', (chunk) => {
  stdout += chunk.toString()
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  stderr += chunk.toString()
  process.stderr.write(chunk)
})

const result = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const output = stdout + stderr
if (
  result.code !== 0 &&
  output.includes('Functions cannot be passed directly to Client Components') &&
  output.includes('{action: function, children: <button/>}')
) {
  console.log('REPRODUCED: the hoisted server action was emitted as a plain function and the page failed to prerender.')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('NOT REPRODUCED: the page containing the hoisted server action built successfully.')
  process.exitCode = 1
} else {
  console.error(`CHECK FAILED: next build exited with code ${result.code} and signal ${result.signal ?? 'none'} without the reported diagnostic.`)
  process.exitCode = 2
}
