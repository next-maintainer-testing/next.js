import { spawn } from 'node:child_process'
import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextVersion = require('next/package.json').version
const nextMajor = Number.parseInt(nextVersion.split('.')[0], 10)
const nextBin = require.resolve('next/dist/bin/next')

function runNext(args) {
  return new Promise((resolve, reject) => {
    const legacyProvider = '--openssl-legacy-provider'
    const nodeOptions = process.env.NODE_OPTIONS || ''
    const child = spawn(process.execPath, [nextBin, ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_OPTIONS: nodeOptions.includes(legacyProvider)
          ? nodeOptions
          : `${nodeOptions} ${legacyProvider}`.trim(),
      },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error(`next ${args.join(' ')} failed (${signal || code})`))
      } else {
        resolve()
      }
    })
  })
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)))
    else files.push(path.relative(root, absolute))
  }
  return files
}

try {
  await rm('.next', { recursive: true, force: true })
  await rm('out', { recursive: true, force: true })
  await runNext(['build'])
  if (nextMajor < 14) await runNext(['export'])

  const files = await listFiles(path.resolve('out'))
  const routeFiles = files.filter((file) => file.startsWith(`test${path.sep}`))
  const encoded = routeFiles.filter((file) => /path%20with%20spaces/i.test(file))
  const unencoded = routeFiles.filter((file) => /path with spaces/i.test(file))

  if (encoded.length > 0 && unencoded.length === 0) {
    console.log(`SYMPTOM_PRESENT next=${nextVersion} encoded=${encoded.join(',')}`)
    process.exitCode = 0
  } else if (unencoded.length > 0 && encoded.length === 0) {
    console.log(`SYMPTOM_ABSENT next=${nextVersion} unencoded=${unencoded.join(',')}`)
    process.exitCode = 1
  } else {
    console.error(`CHECK_FAILED next=${nextVersion} routeFiles=${JSON.stringify(routeFiles)}`)
    process.exitCode = 2
  }
} catch (error) {
  console.error(error?.stack || error)
  process.exitCode = 2
}
