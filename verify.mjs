import { spawnSync } from 'node:child_process'
import { rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = dirname(fileURLToPath(import.meta.url))
const externalFile = join(dirname(appDir), `next-54681-env-${process.pid}.sh`)
const envLink = join(appDir, '.env')
let exitCode = 2

try {
  rmSync(envLink, { force: true })
  writeFileSync(
    externalFile,
    'NEXTAUTH_URL=http://localhost:3000\nHOMEPAGE=http://localhost:3000\n',
  )
  symlinkSync(externalFile, envLink)

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: appDir,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 240_000,
  })
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  process.stdout.write(output)

  if (result.error) {
    console.error(`Build check failed to execute: ${result.error.message}`)
    exitCode = 2
  } else if (result.status === 0) {
    console.log('Symptom absent: next build succeeded with the external symlinked .env file.')
    exitCode = 1
  } else {
    const parsedExternalFile =
      output.includes(`next-54681-env-${process.pid}.sh`) &&
      output.includes('Module parse failed') &&
      output.includes('NEXTAUTH_URL=http://localhost:3000')

    if (parsedExternalFile) {
      console.log('Symptom present: next build attempted to compile the external .env target.')
      exitCode = 0
    } else {
      console.error(`Build failed without the reported symptom (status ${result.status}).`)
      exitCode = 2
    }
  }
} catch (error) {
  console.error(error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  rmSync(envLink, { force: true })
  rmSync(externalFile, { force: true })
}
