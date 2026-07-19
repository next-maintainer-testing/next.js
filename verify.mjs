import { rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
rmSync('.next', { force: true, recursive: true })

const result = spawnSync(
  process.execPath,
  [require.resolve('next/dist/bin/next'), 'build'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    maxBuffer: 50 * 1024 * 1024,
    timeout: 280_000,
  }
)

const output = `${result.stdout || ''}\n${result.stderr || ''}`
const controlRendered = output.includes('REPRO_CONTROL_RENDERED:example')
const metadataCalled = output.includes('REPRO_METADATA_CALLED:example')
const metadataRendered = output.includes('REPRO_WITH_METADATA_RENDERED:example:')

console.log(JSON.stringify({
  buildExitCode: result.status,
  signal: result.signal,
  controlRendered,
  metadataCalled,
  metadataRendered,
}))

if (result.error || result.signal || result.status !== 0) {
  console.error(output.slice(-12000))
  process.exitCode = 2
} else if (!controlRendered) {
  console.error('The control image did not render during next build; the comparison is invalid.')
  console.error(output.slice(-12000))
  process.exitCode = 2
} else if (!metadataRendered) {
  console.log('Symptom present: adding generateImageMetadata prevents the image renderer from running during next build.')
  process.exitCode = 0
} else {
  console.log('Symptom absent: both image renderers ran during next build.')
  process.exitCode = 1
}

rmSync('.next', { force: true, recursive: true })
