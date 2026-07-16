import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['server.js'], {
  cwd: import.meta.dirname,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const timer = setTimeout(() => child.kill('SIGKILL'), 30_000)
const { code, signal } = await new Promise((resolve) => {
  child.once('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timer)

const symptom = 'Invariant: AsyncLocalStorage accessed in runtime where it is not available'
if (code === 73 && output.includes(symptom)) {
  console.log('REPRODUCED:', symptom)
  process.exitCode = 0
} else if (code === 0 && output.includes('ASYNC_LOCAL_STORAGE_AVAILABLE')) {
  console.log('NOT_REPRODUCED: shared AsyncLocalStorage operation succeeded')
  process.exitCode = 1
} else {
  console.error(`CHECK_FAILED: child exited code=${code} signal=${signal}\n${output}`)
  process.exitCode = 2
}
