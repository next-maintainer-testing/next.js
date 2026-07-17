import { existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const compileMarker = new URL('./.next/after-production-compile.txt', import.meta.url)
const staticMarker = new URL('./.next/copied-after-static-generation.txt', import.meta.url)

function verify() {
  rmSync(new URL('./.next/', import.meta.url), { recursive: true, force: true })

  const build = spawnSync('npm', ['run', 'build'], {
    cwd: new URL('.', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  })

  const output = `${build.stdout ?? ''}${build.stderr ?? ''}`
  process.stdout.write(output)

  if (build.error || build.status !== 0) {
    console.error(`Verification failed: next build did not complete (status ${build.status}).`)
    return 2
  }

  const compileHookCalled = existsSync(compileMarker)
  const staticHookCalled = existsSync(staticMarker)
  console.log(JSON.stringify({ compileHookCalled, staticHookCalled }))

  if (!compileHookCalled && !staticHookCalled) {
    console.log('Symptom reproduced: neither requested post-build lifecycle callback ran.')
    return 0
  }

  console.log('Symptom absent: at least one requested post-build lifecycle callback ran.')
  return 1
}

try {
  process.exitCode = verify()
} catch (error) {
  console.error(error)
  process.exitCode = 2
}
