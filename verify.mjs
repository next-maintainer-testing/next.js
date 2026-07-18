import { spawn } from 'node:child_process'

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
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

const timeout = setTimeout(() => {
  child.kill('SIGTERM')
}, 240_000)

const [code, signal] = await new Promise((resolve) => {
  child.once('exit', (exitCode, exitSignal) => resolve([exitCode, exitSignal]))
})
clearTimeout(timeout)

const windowFailure = /(?:ReferenceError:\s*)?window is not defined/i.test(output)
const prerenderFailure = /(?:Error occurred prerendering page|prerender-error)/i.test(output)

if (code !== 0 && windowFailure && prerenderFailure) {
  console.log('REPRODUCED: build prerender evaluated the manually suspended Client Component without window')
  process.exitCode = 0
} else if (code === 0) {
  console.log('NOT REPRODUCED: next build completed successfully')
  process.exitCode = 1
} else if (!windowFailure && /Failed to parse URL from \/message\.txt/i.test(output) && prerenderFailure) {
  console.log('REPRODUCED: build prerender attempted the browser-relative fetch on the server')
  process.exitCode = 0
} else {
  console.error(`CHECK FAILED: next build exited with code ${code} signal ${signal ?? 'none'} without the reported error`)
  process.exitCode = 2
}
