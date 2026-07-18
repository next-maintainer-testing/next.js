import { spawn } from 'node:child_process'

const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
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

const missingStaticParams = /missing ["']generateStaticParams\(\)["']/i.test(output)
const exportDynamicRoute = /cannot be used with ["']output:\s*export["']/i.test(output)

if ('error' in result) {
  console.error(`Verification could not start Next.js: ${result.error.message}`)
  process.exitCode = 2
} else if (result.signal) {
  console.error(`Next.js build terminated by signal ${result.signal}`)
  process.exitCode = 2
} else if (result.code !== 0 && missingStaticParams && exportDynamicRoute) {
  console.log('REPRODUCED: output: export rejects the client-only dynamic route because generateStaticParams() is missing.')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('NOT REPRODUCED: the static export build accepted the client-only dynamic route.')
  process.exitCode = 1
} else {
  console.error(`INCONCLUSIVE: build failed without the reported dynamic-route export diagnostic (exit ${result.code}).`)
  process.exitCode = 2
}
