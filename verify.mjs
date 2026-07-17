import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
rmSync(path.join(root, '.next'), { recursive: true, force: true })

function run(command, args, timeout) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  })
}

const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
const tscBin = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const build = run(process.execPath, [nextBin, 'build'], 240_000)
const typecheck = run(process.execPath, [tscBin, '--noEmit', '--pretty', 'false'], 45_000)
const buildOutput = `${build.stdout || ''}\n${build.stderr || ''}`
const typeOutput = `${typecheck.stdout || ''}\n${typecheck.stderr || ''}`
const output = `${buildOutput}\n${typeOutput}`

const expectedDiagnostic =
  typecheck.status !== 0 &&
  /components[\\/]Pager\.tsx/.test(typeOutput) &&
  /error TS2322/.test(typeOutput) &&
  /Route<.*>/.test(typeOutput) &&
  /URL/.test(typeOutput) &&
  /not assignable to type/.test(typeOutput)

if (expectedDiagnostic) {
  console.log('SYMPTOM_PRESENT: TypeScript rejected Route<T> | URL returned by the Pager callback at Link href.')
  console.log(typeOutput.trim())
  process.exitCode = 0
} else if (build.status === 0 && typecheck.status === 0) {
  console.log('SYMPTOM_ABSENT: Next.js generated typed routes and TypeScript accepted both Link href expressions.')
  process.exitCode = 1
} else {
  console.error('CHECK_FAILED: route type generation or TypeScript failed for an unrelated reason.')
  console.error(output.trim())
  if (build.error) console.error(build.error)
  if (typecheck.error) console.error(typecheck.error)
  process.exitCode = 2
}
