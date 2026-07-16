import { spawn } from 'node:child_process'

const tsc = process.platform === 'win32'
  ? 'node_modules/.bin/tsc.cmd'
  : 'node_modules/.bin/tsc'

const child = spawn(tsc, ['--pretty', 'false', '--noEmit'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
child.stdout.on('data', (chunk) => { output += chunk })
child.stderr.on('data', (chunk) => { output += chunk })

const code = await new Promise((resolve, reject) => {
  child.once('error', reject)
  child.once('close', resolve)
})

const normalized = output.replaceAll('\\', '/')
const symptom = code !== 0
  && normalized.includes("'source' does not exist in type 'MiddlewareMatcher'")
  && normalized.includes('middleware.ts')

if (symptom) {
  console.log('SYMPTOM_PRESENT: MiddlewareConfig rejects the documented matcher source field.')
  process.exitCode = 0
} else if (code === 0) {
  console.log('SYMPTOM_ABSENT: MiddlewareConfig accepts the documented matcher source field.')
  process.exitCode = 1
} else {
  console.error('CHECK_FAILED: TypeScript failed for an unexpected reason.')
  console.error(output)
  process.exitCode = 2
}
