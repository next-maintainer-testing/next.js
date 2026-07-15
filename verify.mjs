import { spawn } from 'node:child_process'
import { rm } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const nextDir = path.join(root, '.next')

function runBuild() {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
    const child = spawn(command, ['run', 'build'], {
      cwd: root,
      env: {
        ...process.env,
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, output }))
  })
}

let resultCode = 2
let observation = 'check did not complete'

try {
  // A configured CodeBuild cache path does not itself restore files when the
  // project-level cache is disabled. Model that exact state with a clean build.
  await rm(nextDir, { recursive: true, force: true })

  const build = await runBuild()
  if (build.code !== 0) {
    observation = `build failed (code=${build.code}, signal=${build.signal ?? 'none'})\n${build.output}`
  } else {
    const warningPresent = /No build cache found/i.test(build.output)
    resultCode = warningPresent ? 0 : 1
    observation = warningPresent
      ? 'symptom present: a clean CI build printed the no-build-cache warning'
      : 'symptom absent: a clean CI build did not print the no-build-cache warning'
  }
} catch (error) {
  observation = `check failed: ${error?.stack ?? error}`
}

console.log(observation)
process.exitCode = resultCode

try {
  await rm(nextDir, { recursive: true, force: true })
} catch (error) {
  console.error(`cleanup failed: ${error?.stack ?? error}`)
  process.exitCode = 2
}
