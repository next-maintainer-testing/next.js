import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const tsconfigPath = resolve('tsconfig.json')
const baseline = `${JSON.stringify({
  compilerOptions: {
    target: 'ES2017',
    lib: ['dom', 'dom.iterable', 'esnext'],
    allowJs: false,
    skipLibCheck: true,
    strict: true,
    noEmit: true,
    esModuleInterop: true,
    module: 'node20',
    moduleResolution: 'node16',
    resolveJsonModule: true,
    isolatedModules: true,
    jsx: 'preserve',
    incremental: true,
    plugins: [{ name: 'next' }],
  },
  include: ['next-env.d.ts', '.next/types/**/*.ts', '**/*.ts', '**/*.tsx'],
  exclude: ['node_modules'],
}, null, 2)}\n`

writeFileSync(tsconfigPath, baseline)
rmSync(resolve('.next'), { recursive: true, force: true })

const nextBin = resolve('node_modules', '.bin', 'next')
const result = spawnSync(nextBin, ['build'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 240_000,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
})
const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(output)

let exitCode = 2
let observed = 'check failed before tsconfig.json could be inspected'
try {
  const after = JSON.parse(readFileSync(tsconfigPath, 'utf8'))
  const moduleValue = String(after?.compilerOptions?.module ?? '').toLowerCase()
  const wasRewritten = moduleValue === 'esnext'
  if (wasRewritten) {
    exitCode = 0
    observed = 'symptom present: next build rewrote compilerOptions.module from node20 to esnext'
  } else if (result.status === 0 && !result.error) {
    exitCode = 1
    observed = `symptom absent: compilerOptions.module is ${moduleValue || '<missing>'}`
  } else {
    observed = `check failed because next build did not complete (status=${String(result.status)}, error=${result.error?.message ?? 'none'})`
  }
} catch (error) {
  observed = `check failed: ${error instanceof Error ? error.message : String(error)}`
}

console.log(`\nVERIFY: ${observed}`)
process.exitCode = exitCode
writeFileSync(tsconfigPath, baseline)
