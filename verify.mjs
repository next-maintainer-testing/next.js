import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => {
  output += chunk
  process.stdout.write(chunk)
})
child.stderr.on('data', (chunk) => {
  output += chunk
  process.stderr.write(chunk)
})

let result
try {
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  const symptom = output.includes('NextRouter was not mounted')
  if (symptom && code !== 0) {
    console.log('VERIFICATION: symptom present — development NODE_ENV build failed with NextRouter was not mounted')
    result = 0
  } else if (code === 0 && !symptom) {
    console.log('VERIFICATION: symptom absent — development NODE_ENV build succeeded')
    result = 1
  } else {
    console.error(`VERIFICATION: check failed — build exited ${code} without the expected reported symptom`)
    result = 2
  }
} catch (error) {
  console.error('VERIFICATION: check failed while running next build', error)
  result = 2
}

process.exitCode = result
try {
  await rm('.next', { recursive: true, force: true })
} catch (error) {
  console.error('VERIFICATION: cleanup failed', error)
  process.exitCode = 2
}
