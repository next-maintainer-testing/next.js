import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

await rm('.next', { recursive: true, force: true })

const child = spawn('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
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

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})

const diagnostic = /useSearchParams\(\) should be wrapped in a suspense boundary/i.test(output)
const prerenderFailure = /Error occurred prerendering (?:page|route)/i.test(output)

if (diagnostic && prerenderFailure && result.code !== 0) {
  console.log('VERIFICATION: reported build failure reproduced')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('VERIFICATION: build completed; reported symptom absent')
  process.exitCode = 1
} else {
  console.error(`VERIFICATION: build check failed without the reported symptom (code=${result.code}, signal=${result.signal ?? 'none'}, error=${result.error?.message ?? 'none'})`)
  process.exitCode = 2
}
