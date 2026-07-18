import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

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

const result = await new Promise((resolve) => {
  child.once('error', (error) => resolve({ error }))
  child.once('exit', (code, signal) => resolve({ code, signal }))
})

const configWasRejected =
  /can't recognize the exported `config` field in route ["']?\/api\/test/.test(output) &&
  /Unsupported node type ["']TsConstAssertion["'] at ["']config["']/.test(output) &&
  /default config will be used instead/.test(output)

if ('error' in result || result.signal) {
  console.error('Verification failed to execute next build:', result)
  process.exitCode = 2
} else if (result.code !== 0) {
  console.error('Verification failed: next build failed for an unrelated reason.')
  process.exitCode = 2
} else if (configWasRejected) {
  console.log('REPRODUCED: next build rejected the API route config because it uses `as const` and used the default config instead.')
  process.exitCode = 0
} else {
  console.log('NOT REPRODUCED: next build accepted the API route config using `as const`.')
  process.exitCode = 1
}
