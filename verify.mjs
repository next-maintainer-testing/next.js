import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
let nextBin
try {
  nextBin = require.resolve('next/dist/bin/next')
} catch (error) {
  console.error(`Unable to resolve the installed Next.js binary: ${error.message}`)
  process.exitCode = 2
}

if (nextBin) {
  const escapedBin = nextBin.replaceAll("'", "'\\''")
  const child = spawn('/bin/sh', ['-c', `ulimit -n 32 && exec "${process.execPath}" '${escapedBin}' build`], {
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
    child.once('close', (code, signal) => resolve({ code, signal }))
  })

  if (result.error) {
    console.error(`Could not start next build: ${result.error.message}`)
    process.exitCode = 2
  } else if (/EMFILE|too many open files/i.test(output)) {
    console.log('Observed the reported EMFILE build failure.')
    process.exitCode = 0
  } else if (result.code === 0) {
    console.log('Build completed without the reported EMFILE failure.')
    process.exitCode = 1
  } else {
    console.error(`Build failed without EMFILE (code=${result.code}, signal=${result.signal ?? 'none'}).`)
    process.exitCode = 2
  }
}
