import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const workspace = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const eslintPackage = require.resolve('eslint/package.json')
const eslintBin = join(dirname(eslintPackage), 'bin', 'eslint.js')
const target = 'app/api/og/route.tsx'
const ruleId = '@next/next/no-img-element'

const result = spawnSync(
  process.execPath,
  [eslintBin, target, '--no-cache', '--format', 'json'],
  {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 240_000,
    maxBuffer: 10 * 1024 * 1024,
  },
)

if (result.error || result.signal || result.status === null) {
  console.error('ESLint check could not complete', result.error ?? result.signal)
  process.exitCode = 2
} else {
  let reports
  try {
    reports = JSON.parse(result.stdout)
  } catch {
    console.error('ESLint did not return valid JSON')
    console.error(result.stderr || result.stdout)
    process.exitCode = 2
  }

  if (reports) {
    const warning = reports
      .flatMap((report) => report.messages ?? [])
      .find((message) => message.ruleId === ruleId)

    if (warning) {
      console.log(
        `Symptom present: ${ruleId} warned for <img> in the @vercel/og ImageResponse at ${target}:${warning.line}:${warning.column}`,
      )
      process.exitCode = 0
    } else if (result.status === 0 || result.status === 1) {
      console.log(
        `Symptom absent: ${ruleId} did not warn for <img> in the @vercel/og ImageResponse`,
      )
      process.exitCode = 1
    } else {
      console.error(`ESLint failed with status ${result.status}`)
      console.error(result.stderr || result.stdout)
      process.exitCode = 2
    }
  }
}
