import { spawnSync } from 'node:child_process'

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 280_000,
})

const output = `${result.stdout || ''}\n${result.stderr || ''}`
process.stdout.write(output)

if (result.error) {
  console.error(result.error)
  process.exitCode = 2
} else {
  const missingWildcardExport = /Cannot find module ['"]wildcard-library\/message['"] or its corresponding type declarations/.test(output)
  if (missingWildcardExport && result.status !== 0) {
    process.exitCode = 0
  } else if (result.status === 0) {
    process.exitCode = 1
  } else {
    process.exitCode = 2
  }
}
