import { rm, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import process from 'node:process'

await rm('.next', { recursive: true, force: true })

const nextPackage = JSON.parse(await readFile('node_modules/next/package.json', 'utf8'))
const nextMajor = Number.parseInt(nextPackage.version, 10)
const buildArgs = ['node_modules/next/dist/bin/next', 'build']
if (nextMajor >= 16) buildArgs.push('--webpack')

const child = spawn(process.execPath, buildArgs, {
  cwd: process.cwd(),
  env: { ...process.env, CI: '1', NEXT_TELEMETRY_DISABLED: '1' },
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

const slotMentioned = /a-b/.test(output)
const syntaxFailure = /Module parse failed|Unexpected token|Expression expected|Expected ['"`,}:]/i.test(output)
const symptomPresent = 'code' in result && result.code !== 0 && slotMentioned && syntaxFailure

if (symptomPresent) {
  console.log('\nVERIFICATION: hyphenated parallel-route slot caused the reported webpack build syntax error')
  process.exitCode = 0
} else if ('code' in result && result.code === 0) {
  console.log('\nVERIFICATION: build succeeded; reported symptom is absent')
  process.exitCode = 1
} else {
  console.error('\nVERIFICATION: build failed without the reported hyphenated-slot syntax error')
  if ('error' in result) console.error(result.error)
  if ('signal' in result && result.signal) console.error(`signal: ${result.signal}`)
  process.exitCode = 2
}
