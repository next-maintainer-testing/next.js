import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'

rmSync('.next', { recursive: true, force: true })
rmSync('out', { recursive: true, force: true })

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 270_000,
  maxBuffer: 20 * 1024 * 1024,
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
process.stdout.write(output)

if (result.error) {
  console.error(`Build check failed to execute: ${result.error.message}`)
  process.exitCode = 2
} else {
  const staticDynamicError =
    /couldn't be rendered statically/i.test(output) &&
    /request\.url/i.test(output)

  process.exitCode = result.status !== 0 && staticDynamicError ? 0 : 1
}

rmSync('.next', { recursive: true, force: true })
rmSync('out', { recursive: true, force: true })
