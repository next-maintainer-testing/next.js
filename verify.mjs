import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const outputFile = path.join(process.cwd(), '.verify-output', 'server.js')
const esbuildBin = path.join(process.cwd(), 'node_modules', '.bin', 'esbuild')

const child = spawn(esbuildBin, [
  'server.js',
  '--bundle',
  '--platform=node',
  `--outfile=${outputFile}`,
  '--log-level=error',
  '--log-limit=0',
], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })

let spawnError
child.on('error', (error) => { spawnError = error })
const exitCode = await new Promise((resolve) => child.on('close', resolve))
const diagnostics = `${stdout}\n${stderr}`
const reportedResolutionFailure = /Could not resolve ["'](?:react-dom\/server\.edge|critters|react-server-dom-(?:turbopack|webpack)\/(?:client\.edge|server\.node))["']/i.test(diagnostics)

if (spawnError) {
  console.error(`Verification failed to start esbuild: ${spawnError.message}`)
  process.exitCode = 2
} else if (exitCode !== 0 && reportedResolutionFailure) {
  console.log('Symptom reproduced: esbuild could not bundle the Next.js custom server because a reported Next.js dependency could not be resolved.')
  console.log(diagnostics.trim())
  process.exitCode = 0
} else if (exitCode === 0) {
  console.log('Symptom absent: esbuild bundled the custom server successfully.')
  process.exitCode = 1
} else {
  console.error(`Verification failed for an unrelated reason (esbuild exit ${exitCode}).`)
  console.error(diagnostics.trim())
  process.exitCode = 2
}

await rm(path.dirname(outputFile), { recursive: true, force: true })
