import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const preload = path.join(root, 'freebsd-platform.cjs')
const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')

const child = spawn(process.execPath, [nextBin, 'build'], {
  cwd: root,
  env: {
    ...process.env,
    NEXT_TELEMETRY_DISABLED: '1',
    NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --require=${preload}`.trim(),
  },
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

const timer = setTimeout(() => child.kill('SIGKILL'), 240_000)
let result
try {
  result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
} catch (error) {
  clearTimeout(timer)
  console.error('Unable to run next build:', error)
  process.exitCode = 2
}

if (result) {
  clearTimeout(timer)
  if (result.signal) {
    console.error(`next build terminated by ${result.signal}`)
    process.exitCode = result.signal === 'SIGKILL' ? 2 : 1
  } else {
    const requestedFreeBsdSwc = output.includes('@next/swc-freebsd-x64')
    const downloadFailed = /Failed to download swc package|status 404|Failed to load SWC binary/.test(output)

    if (result.code !== 0 && requestedFreeBsdSwc && downloadFailed) {
      console.log('REPRODUCED: next build failed while obtaining @next/swc-freebsd-x64')
      process.exitCode = 0
    } else {
      console.log(`NOT REPRODUCED: next build exited ${result.code}; FreeBSD SWC request=${requestedFreeBsdSwc}; download failure=${downloadFailed}`)
      process.exitCode = 1
    }
  }
}
