import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { spawn } from 'node:child_process'

const root = process.cwd()
const output = join(root, '.next')
const standalone = join(output, 'standalone')
const ignored = new Set([
  '.next/prerender-manifest.json',
  '.next/server/server-reference-manifest.json',
])
const buildCount = 12

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

async function snapshot(dir, files = new Map()) {
  const entries = await readdir(dir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await snapshot(path, files)
    else if (entry.isFile()) {
      const name = relative(standalone, path).replaceAll('\\', '/')
      if (!ignored.has(name)) {
        const data = await readFile(path)
        files.set(name, createHash('sha256').update(data).digest('hex'))
      }
    }
  }
  return files
}

function differences(a, b) {
  const names = new Set([...a.keys(), ...b.keys()])
  return [...names].filter((name) => a.get(name) !== b.get(name)).sort()
}

let exitCode = 2
try {
  let previous
  for (let build = 1; build <= buildCount; build++) {
    await rm(output, { recursive: true, force: true })
    const result = await runBuild()
    if (result.code !== 0) {
      console.error(`Build ${build} failed (code=${result.code}, signal=${result.signal ?? 'none'}).`)
      console.error(result.stdout.slice(-4000))
      console.error(result.stderr.slice(-4000))
      exitCode = 2
      break
    }
    const current = await snapshot(standalone)
    if (previous) {
      const changed = differences(previous, current)
      if (changed.length) {
        console.log(`Symptom reproduced: consecutive builds ${build - 1} and ${build} differ outside the two expected manifest files.`)
        for (const name of changed) console.log(name)
        exitCode = 0
        break
      }
    }
    previous = current
    exitCode = 1
  }
  if (exitCode === 1) console.log(`Symptom absent after ${buildCount} consecutive clean builds.`)
} catch (error) {
  console.error(error?.stack || error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  await rm(output, { recursive: true, force: true })
}
