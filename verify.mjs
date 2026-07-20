import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const expected = /Image import [\s\S]*icon\.svg[\s\S]* is not a valid image file\. The image may be corrupted or an unsupported format\./

await rm(path.join(root, '.next'), { recursive: true, force: true })

const child = spawn(process.execPath, [nextBin, 'build'], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let output = ''
for (const stream of [child.stdout, child.stderr]) {
  stream.setEncoding('utf8')
  stream.on('data', chunk => {
    output += chunk
    process.stdout.write(chunk)
  })
}

let timedOut = false
const timer = setTimeout(() => {
  timedOut = true
  child.kill('SIGTERM')
  setTimeout(() => child.kill('SIGKILL'), 5000)
}, 240_000)

const result = await new Promise(resolve => {
  child.once('error', error => resolve({ error }))
  child.once('close', (code, signal) => resolve({ code, signal }))
})
clearTimeout(timer)

if (timedOut || result.error) {
  console.error(timedOut ? 'Verification timed out.' : `Failed to start Next.js: ${result.error.message}`)
  process.exitCode = 2
} else if (expected.test(output)) {
  console.log('REPRODUCED: Next.js rejected app/icon.svg as an invalid image file.')
  process.exitCode = 0
} else if (result.code === 0) {
  console.log('NOT REPRODUCED: next build completed without rejecting app/icon.svg.')
  process.exitCode = 1
} else {
  console.error(`INCONCLUSIVE: next build failed without the reported image error (code=${result.code}, signal=${result.signal ?? 'none'}).`)
  process.exitCode = 2
}

await rm(path.join(root, '.next'), { recursive: true, force: true })
