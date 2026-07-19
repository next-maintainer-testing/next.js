import { mkdtemp, mkdir, copyFile, symlink, chmod, chown, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const sandbox = await mkdtemp(join(tmpdir(), 'next-47394-'))
const restrictedParent = join(sandbox, 'users')
const appDir = join(restrictedParent, 'app')
let output = ''
let finalCode = 2

try {
  await mkdir(join(appDir, 'pages'), { recursive: true })
  await copyFile(join(root, 'package.json'), join(appDir, 'package.json'))
  await copyFile(join(root, 'next.config.js'), join(appDir, 'next.config.js'))
  await copyFile(join(root, 'pages', 'index.js'), join(appDir, 'pages', 'index.js'))
  await symlink(join(root, 'node_modules'), join(appDir, 'node_modules'), 'dir')

  const runningAsRoot = typeof process.getuid === 'function' && process.getuid() === 0
  const childUid = runningAsRoot ? 65534 : undefined
  const childGid = runningAsRoot ? 65534 : undefined

  if (runningAsRoot) {
    await chmod(sandbox, 0o711)
    await chmod(restrictedParent, 0o711)
    await chown(appDir, childUid, childGid)
    await chown(join(appDir, 'pages'), childUid, childGid)
    for (const path of ['package.json', 'next.config.js', 'pages/index.js']) {
      await chown(join(appDir, path), childUid, childGid)
    }
  } else {
    await chmod(restrictedParent, 0o311)
  }

  const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  const nextPackage = JSON.parse(await readFile(join(root, 'node_modules', 'next', 'package.json'), 'utf8'))
  const nextMajor = Number.parseInt(nextPackage.version, 10)
  const buildArgs = [nextBin, 'build', ...(nextMajor >= 16 ? ['--webpack'] : [])]
  const child = spawn(process.execPath, buildArgs, {
    cwd: appDir,
    uid: childUid,
    gid: childGid,
    env: {
      ...process.env,
      CI: '1',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    output += text
    process.stdout.write(text)
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    output += text
    process.stderr.write(text)
  })

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })

  if (result.signal || result.code !== 0) {
    console.error(`Build check failed (code=${result.code}, signal=${result.signal})`)
    finalCode = 2
  } else {
    const warning = 'Caching failed for pack: Error: Unable to snapshot resolve dependencies'
    const reproduced = output.includes(warning)
    console.log(reproduced ? `REPRODUCED: ${warning}` : `NOT REPRODUCED: ${warning}`)
    finalCode = reproduced ? 0 : 1
  }
} catch (error) {
  console.error(error)
  finalCode = 2
} finally {
  process.exitCode = finalCode
  await rm(sandbox, { recursive: true, force: true })
}
