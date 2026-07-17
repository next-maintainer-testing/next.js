import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const snapshots = []
const attempts = 18

function files(dir) {
  const result = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) result.push(...files(path))
    else result.push(path)
  }
  return result
}

function buildSnapshot() {
  rmSync(join(root, '.next'), { recursive: true, force: true })
  rmSync(join(root, 'out'), { recursive: true, force: true })
  const run = spawnSync(process.execPath, [join(root, 'node_modules/next/dist/bin/next'), 'build'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    timeout: 120000,
  })
  if (run.error || run.status !== 0) {
    console.error(run.error?.message || `next build exited ${run.status}`)
    console.error(run.stdout)
    console.error(run.stderr)
    process.exitCode = 2
    return null
  }
  const chunkDir = join(root, 'out', '_next', 'static', 'chunks', 'app')
  if (!existsSync(chunkDir)) {
    console.error(`Expected build output missing: ${relative(root, chunkDir)}`)
    process.exitCode = 2
    return null
  }
  const snapshot = files(chunkDir).sort().map((path) => {
    const data = readFileSync(path)
    return `${relative(chunkDir, path)} ${createHash('sha256').update(data).digest('hex')}`
  }).join('\n')
  console.log(snapshot)
  return snapshot
}

for (let attempt = 1; attempt <= attempts; attempt++) {
  console.log(`Build ${attempt}/${attempts}`)
  const snapshot = buildSnapshot()
  if (snapshot === null) break
  snapshots.push(snapshot)
  if (snapshot !== snapshots[0]) {
    console.log('SYMPTOM PRESENT: identical clean builds emitted different app chunk filenames or contents')
    process.exitCode = 0
    break
  }
}

if (process.exitCode === undefined) {
  console.log('SYMPTOM ABSENT: all identical clean builds emitted identical app chunks')
  process.exitCode = 1
}
rmSync(join(root, '.next'), { recursive: true, force: true })
rmSync(join(root, 'out'), { recursive: true, force: true })
