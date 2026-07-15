import { rm } from 'node:fs/promises'
import { spawn } from 'node:child_process'

await rm('.next', { recursive: true, force: true })

const child = spawn(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let stdout = ''
let stderr = ''
child.stdout.setEncoding('utf8')
child.stderr.setEncoding('utf8')
child.stdout.on('data', (chunk) => { stdout += chunk })
child.stderr.on('data', (chunk) => { stderr += chunk })

let timedOut = false
const exitCode = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    timedOut = true
    child.kill('SIGTERM')
  }, 120_000)

  child.once('close', (code) => {
    clearTimeout(timer)
    resolve(code)
  })
})

if (timedOut) {
  console.error('Verification failed: next build timed out')
  process.exitCode = 2
} else {
  const output = `${stdout}\n${stderr}`
  const secondsRouteFailed = /Route ["']\/seconds["']/.test(output)
  const missingSuspense = /without a Suspense boundary|outside of <Suspense>/i.test(output)
  const minutesRouteFailed = /Route ["']\/minutes["']/.test(output)

  if (secondsRouteFailed && missingSuspense && !minutesRouteFailed) {
    console.log('REPRODUCED: cacheLife("seconds") caused the missing-Suspense prerender error while cacheLife("minutes") did not')
    process.exitCode = 0
  } else if (exitCode === 0) {
    console.log('NOT REPRODUCED: both cache-life routes built successfully')
    process.exitCode = 1
  } else {
    console.error('Verification failed: build failed without the targeted /seconds-only missing-Suspense symptom')
    console.error(output.slice(-4000))
    process.exitCode = 2
  }
}
