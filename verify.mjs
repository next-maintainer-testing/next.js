import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

await rm('.next', { recursive: true, force: true })

const child = spawn('node', ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NO_COLOR: '1' },
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

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const normalized = output.replaceAll('\\', '/')
const hasRootDirValidatorError =
  /\.next\/types\/validator\.ts/.test(normalized) &&
  /is not under ['"]?rootDir['"]?/i.test(normalized) &&
  /rootDir[^\n]*\/src/i.test(normalized)

if (hasRootDirValidatorError) {
  console.log('\nVERIFICATION: rootDir excludes generated .next/types/validator.ts')
  process.exitCode = 0
} else if ('error' in result) {
  console.error(`\nVERIFICATION_FAILED: could not start Next.js build: ${result.error.message}`)
  process.exitCode = 2
} else if (result.code === 0) {
  console.log('\nVERIFICATION: build completed without the reported rootDir validator error')
  process.exitCode = 1
} else {
  console.error(`\nVERIFICATION_FAILED: build exited ${result.code ?? 'null'}${result.signal ? ` (${result.signal})` : ''} without the reported error`)
  process.exitCode = 2
}
