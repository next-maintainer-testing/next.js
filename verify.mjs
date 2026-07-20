import { existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('out', { recursive: true, force: true })
rmSync('.next', { recursive: true, force: true })

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const build = spawnSync(npm, ['run', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'pipe',
})

if (build.error || build.status !== 0) {
  console.error('CHECK_FAILED: next build did not complete successfully')
  if (build.error) console.error(build.error.message)
  console.error(build.stdout ?? '')
  console.error(build.stderr ?? '')
  process.exitCode = 2
} else if (!existsSync('out')) {
  console.log('SYMPTOM_PRESENT: next build succeeded but did not create the configured out directory')
  process.exitCode = 0
} else {
  console.log('SYMPTOM_ABSENT: next build created the configured out directory')
  process.exitCode = 1
}
