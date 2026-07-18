import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { rm, symlink } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

async function build(label) {
  return await new Promise((resolve, reject) => {
    const child = spawn(pnpm, ['run', 'build'], {
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
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ label, code, signal, output }))
  })
}

let exitCode = 2
try {
  await rm('.next', { recursive: true, force: true })

  const first = await build('first')
  if (first.code !== 0) {
    console.error(`CHECK_FAILED: first build failed (code=${first.code}, signal=${first.signal ?? 'none'})`)
  } else {
    const nextLib = join(dirname(require.resolve('next/package.json')), 'dist', 'lib')
    const junction = join('.next', 'standalone', 'windows-junction-next-lib')
    await symlink(nextLib, junction, 'junction')
    console.log(`Created Windows-junction-equivalent link: ${junction} -> ${nextLib}`)

    const second = await build('second')
    const reportedError =
      second.code !== 0 &&
      /Cannot find module ['"]\.\.\/lib\/verify-typescript-setup['"]/.test(second.output)

    if (reportedError) {
      console.log('SYMPTOM_PRESENT: second standalone build followed the junction, deleted Next.js files, and failed to resolve ../lib/verify-typescript-setup')
      exitCode = 0
    } else if (second.code === 0) {
      console.log('SYMPTOM_ABSENT: second standalone build did not corrupt the installed Next.js package')
      exitCode = 1
    } else {
      console.error(`CHECK_FAILED: second build failed for a different reason (code=${second.code}, signal=${second.signal ?? 'none'})`)
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
}

process.exitCode = exitCode
