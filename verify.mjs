import { spawn } from 'node:child_process'

const route = '/dynamic-route/search-params'
const expected = new RegExp(
  `Static generation failed due to dynamic usage on ${route.replaceAll('/', '\\/')}, reason: .*searchParams`,
  'i'
)

let output = ''
const child = spawn(process.execPath, [
  './node_modules/next/dist/bin/next',
  'build',
  '--debug',
], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

child.stdout.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stdout.write(text)
})
child.stderr.on('data', (chunk) => {
  const text = chunk.toString()
  output += text
  process.stderr.write(text)
})

const timer = setTimeout(() => child.kill('SIGTERM'), 270_000)
const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timer)

if (result.error || result.signal || ![0, 1].includes(result.code)) {
  console.error('Verification command failed:', result.error ?? `code=${result.code} signal=${result.signal}`)
  process.exitCode = 2
} else if (expected.test(output)) {
  console.log(`\nSYMPTOM_PRESENT: debug build emitted a static-generation failure for ${route}`)
  process.exitCode = 0
} else {
  console.log(`\nSYMPTOM_ABSENT: no static-generation failure was emitted for ${route}`)
  process.exitCode = 1
}
