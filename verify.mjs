import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? cssFiles(path) : entry.name.endsWith('.css') ? [path] : []
  })
}

rmSync('.next', { recursive: true, force: true })
const build = spawnSync('npm', ['run', 'build'], {
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 240_000,
})

if (build.error || build.status !== 0) {
  console.error(build.stdout ?? '')
  console.error(build.stderr ?? '')
  console.error(build.error ?? `next build exited ${build.status}`)
  process.exitCode = 2
} else {
  let files
  try {
    files = cssFiles('.next/static')
  } catch (error) {
    console.error('Could not inspect emitted CSS:', error)
    process.exitCode = 2
  }

  if (files) {
    const css = files.map((file) => readFileSync(file, 'utf8')).join('\n')
    const rule = css.match(/\.issue-86509-target\s*\{([^}]*)\}/)
    if (!rule) {
      console.error('The marked CSS rule was not emitted')
      process.exitCode = 2
    } else {
      const body = rule[1].replace(/\s+/g, '')
      const retainedInOrder = /rotate:91deg;.*transform:skewY\(7deg\);.*translate:3%97%;?/.test(body)
      if (retainedInOrder) {
        console.log(`Symptom absent; emitted declarations were retained in order: ${rule[0]}`)
        process.exitCode = 1
      } else {
        console.log(`Symptom present; emitted rule changed or removed individual transforms: ${rule[0]}`)
        process.exitCode = 0
      }
    }
  }
}
