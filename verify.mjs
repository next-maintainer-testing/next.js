import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
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

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('close', (code, signal) => {
    if (signal) reject(new Error(`next build terminated by ${signal}`))
    else resolve(code)
  })
})

const namedExportDiagnostic = /["']?utilHelper["']? is not a valid Page export field/
if (exitCode !== 0 && namedExportDiagnostic.test(output)) {
  console.log('REPRODUCED: next build rejects the named utilHelper export from app/page.tsx')
  process.exitCode = 0
} else if (exitCode === 0) {
  console.log('NOT REPRODUCED: next build accepted the named page export')
  process.exitCode = 1
} else {
  console.error('CHECK FAILED: next build failed without the reported named-export diagnostic')
  process.exitCode = 2
}
