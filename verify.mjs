import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })
rmSync('out', { recursive: true, force: true })

const result = spawnSync(process.execPath, ['./node_modules/next/dist/bin/next', 'build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  timeout: 120_000,
})

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
const symptom = /Page ["']?\/foo\/\[slug\]["']? is missing ["']generateStaticParams\(\)["'] so it cannot be used with ["']output: export["'] config\.?/.test(output)

if (symptom && result.status !== 0) {
  console.log('SYMPTOM_PRESENT: static export rejects generateStaticParams returning an empty array')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('SYMPTOM_ABSENT: static export accepts generateStaticParams returning an empty array')
  process.exitCode = 1
} else {
  console.error('CHECK_FAILED: build failed without the reported diagnostic')
  console.error(output.slice(-4000))
  process.exitCode = 2
}
