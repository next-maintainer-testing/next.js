import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const finish = (code, message) => {
  process.exitCode = code
  console.log(message)
}

try {
  rmSync('.next', { recursive: true, force: true })
  const build = spawnSync(process.execPath, [join('node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 180_000,
  })

  if (build.error || build.status !== 0) {
    const detail = build.error?.message ?? `${build.stdout}\n${build.stderr}`
    finish(2, `CHECK_FAILED: Next.js build failed\n${detail}`)
  } else {
    const chunksDir = join('.next', 'static', 'chunks')
    if (!existsSync(chunksDir)) {
      finish(2, 'CHECK_FAILED: build produced no client chunks directory')
    } else {
      const files = readdirSync(chunksDir, { recursive: true })
        .filter((file) => typeof file === 'string' && file.endsWith('.js'))
      const assignment = /(?:window\.)?history\.scrollRestoration\s*=\s*["']manual["']/
      const matched = files.find((file) => assignment.test(readFileSync(join(chunksDir, file), 'utf8')))
      const nextVersion = JSON.parse(readFileSync(join('node_modules', 'next', 'package.json'), 'utf8')).version

      if (matched) {
        finish(0, `SYMPTOM_PRESENT: Next.js ${nextVersion} generated ${matched} with history.scrollRestoration = "manual"; this is the condition that makes iOS WebKit suppress the swipe-back snapshot.`)
      } else {
        finish(1, `SYMPTOM_ABSENT: Next.js ${nextVersion} generated no client assignment of history.scrollRestoration = "manual".`)
      }
    }
  }
} catch (error) {
  finish(2, `CHECK_FAILED: ${error.stack ?? error}`)
}
