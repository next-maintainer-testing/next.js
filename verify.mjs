import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

rmSync('.next', { recursive: true, force: true })

const result = spawnSync('npm', ['run', 'build'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CI: '1',
    NEXT_TELEMETRY_DISABLED: '1',
  },
  encoding: 'utf8',
  timeout: 240_000,
})

const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
process.stdout.write(output)

const failedBuild = result.status !== 0
const nestedRouteFailed = /(?:\/|\\)list(?:\/|\\)products|\/list\/products/.test(output)
const contextComponentFailed = /createContext is not a function/.test(output)

if (failedBuild && nestedRouteFailed && contextComponentFailed) {
  console.log('REPRODUCED: the nested server page crashes while loading the context-using CJS component library')
  process.exitCode = 0
} else if (result.status === 0) {
  console.log('NOT REPRODUCED: the application built successfully')
  process.exitCode = 1
} else {
  console.error(`CHECK FAILED: build exited with ${result.status ?? result.signal ?? 'unknown'} without the expected nested-route context error`)
  process.exitCode = 2
}
