import { spawn } from 'node:child_process'
import { cp, lstat, mkdtemp, readdir, readlink, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const projectDir = process.cwd()
const virtualStoreDir = path.join(os.homedir(), '.cache', 'vstore', 'next-84342-app')
let isolatedDir

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      if (signal || code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed (${signal ?? code})`))
      } else {
        resolve()
      }
    })
  })
}

async function danglingLinks(root) {
  const broken = []
  async function visit(entryPath) {
    const metadata = await lstat(entryPath)
    if (metadata.isSymbolicLink()) {
      try {
        await stat(entryPath)
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        broken.push({
          link: path.relative(root, entryPath),
          target: await readlink(entryPath),
        })
      }
      return
    }
    if (!metadata.isDirectory()) return
    for (const entry of await readdir(entryPath)) {
      await visit(path.join(entryPath, entry))
    }
  }
  await visit(root)
  return broken
}

try {
  await rm(path.join(projectDir, 'node_modules'), { recursive: true, force: true })
  await rm(path.join(projectDir, '.next'), { recursive: true, force: true })
  await rm(virtualStoreDir, { recursive: true, force: true })

  await run('corepack', [
    'pnpm',
    'install',
    '--config.confirmModulesPurge=false',
    '--virtual-store-dir',
    virtualStoreDir,
    '--no-frozen-lockfile',
  ])
  await run('corepack', ['pnpm', 'exec', 'next', 'build', '--webpack'])

  isolatedDir = await mkdtemp(path.join(os.tmpdir(), 'next-84342-standalone-'))
  const isolatedStandalone = path.join(isolatedDir, 'standalone')
  await cp(path.join(projectDir, '.next', 'standalone'), isolatedStandalone, {
    recursive: true,
    dereference: false,
    verbatimSymlinks: true,
  })
  const broken = await danglingLinks(path.join(isolatedStandalone, 'node_modules'))
  if (broken.length > 0) {
    console.log(`SYMPTOM_PRESENT: ${broken.length} dangling symlink(s) after moving the standalone output in isolation`)
    console.log(JSON.stringify(broken.slice(0, 10), null, 2))
    process.exitCode = 0
  } else {
    console.log('SYMPTOM_ABSENT: standalone node_modules remains self-contained after moving it in isolation')
    process.exitCode = 1
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
} finally {
  await rm(virtualStoreDir, { recursive: true, force: true })
  if (isolatedDir) await rm(isolatedDir, { recursive: true, force: true })
}
