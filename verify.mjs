import { existsSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })
rmSync('out', { recursive: true, force: true })

const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 180_000,
})
const output = `${build.stdout ?? ''}\n${build.stderr ?? ''}`
process.stdout.write(output)

if (build.error) {
  console.error(`CHECK_FAILED: unable to execute next build: ${build.error.message}`)
  process.exitCode = 2
} else if (build.signal || build.status === null) {
  console.error(`CHECK_FAILED: next build terminated by ${build.signal ?? 'unknown cause'}`)
  process.exitCode = 2
} else {
  const routeWasOmitted = !existsSync('out/some-page.html') && !existsSync('out/some-page/index.html')
  const successfulBuild = build.status === 0
  const dynamicallyClassified = /(?:ƒ|λ)\s+\/some-page\b/.test(output)

  if (successfulBuild && routeWasOmitted && dynamicallyClassified) {
    console.log('SYMPTOM_PRESENT: next build succeeded but classified /some-page as dynamic and omitted it from the static export.')
    process.exitCode = 0
  } else {
    console.log(`SYMPTOM_ABSENT: status=${build.status}, omitted=${routeWasOmitted}, dynamicallyClassified=${dynamicallyClassified}`)
    process.exitCode = 1
  }
}
