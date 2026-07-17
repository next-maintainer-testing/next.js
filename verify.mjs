import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = dirname(fileURLToPath(import.meta.url))
const stagedPackage = join(root, 'node_modules', '@next', 'third-parties')
let temporaryDirectory

async function classify() {
  const nextPackage = JSON.parse(
    await readFile(join(root, 'node_modules', 'next', 'package.json'), 'utf8'),
  )
  const nextVersion = nextPackage.version
  if (!/^\d[0-9A-Za-z.+-]*$/.test(nextVersion)) {
    throw new Error(`Unexpected installed Next.js version: ${nextVersion}`)
  }

  temporaryDirectory = await mkdtemp(join(tmpdir(), 'next-58472-'))
  const packed = await execFileAsync(
    'npm',
    [
      'pack',
      `@next/third-parties@${nextVersion}`,
      '--pack-destination',
      temporaryDirectory,
      '--json',
      '--ignore-scripts',
    ],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  )
  const packResult = JSON.parse(packed.stdout)
  if (!Array.isArray(packResult) || packResult.length !== 1 || !packResult[0].filename) {
    throw new Error(`Unexpected npm pack result: ${packed.stdout}`)
  }

  await rm(stagedPackage, { recursive: true, force: true })
  await mkdir(stagedPackage, { recursive: true })
  await execFileAsync(
    'tar',
    [
      '-xzf',
      join(temporaryDirectory, packResult[0].filename),
      '-C',
      stagedPackage,
      '--strip-components=1',
    ],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  )

  try {
    await execFileAsync(
      process.execPath,
      [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '--pretty', 'false'],
      { cwd: root, maxBuffer: 10 * 1024 * 1024 },
    )
    console.log(
      `ABSENT: TypeScript resolved @next/third-parties/google with Next.js ${nextVersion}`,
    )
    return 1
  } catch (error) {
    const output = `${error.stdout ?? ''}\n${error.stderr ?? ''}`
    const targetDiagnostic =
      /error TS2307: Cannot find module ['"]@next\/third-parties\/google['"] or its corresponding type declarations\./
    if (typeof error.code === 'number' && targetDiagnostic.test(output)) {
      console.log(
        `PRESENT: TypeScript emitted TS2307 for @next/third-parties/google with Next.js ${nextVersion}`,
      )
      console.log(output.trim())
      return 0
    }
    throw new Error(`TypeScript check failed unexpectedly:\n${output.trim()}`)
  }
}

try {
  process.exitCode = await classify()
} catch (error) {
  process.exitCode = 2
  console.error(error instanceof Error ? error.stack : error)
} finally {
  await rm(stagedPackage, { recursive: true, force: true })
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}
