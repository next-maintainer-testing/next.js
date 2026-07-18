import { spawn } from 'node:child_process'
import { readdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const outputDir = path.join(root, 'out')

async function listFiles(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)))
    else if (entry.isFile()) files.push(absolute)
  }
  return files
}

async function runBuild() {
  const nextBin = path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next')
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [nextBin, 'build'], {
      cwd: root,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
}

try {
  await Promise.all([
    rm(path.join(root, '.next'), { recursive: true, force: true }),
    rm(outputDir, { recursive: true, force: true }),
  ])

  const result = await runBuild()
  if (result.code !== 0) {
    console.error(`CHECK_FAILED: next build exited with code ${result.code} signal ${result.signal ?? 'none'}`)
    process.exitCode = 2
  } else {
    const files = await listFiles(outputDir)
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const generatedImages = []

    for (const file of files) {
      if (!path.basename(file).startsWith('opengraph-image')) continue
      const bytes = await readFile(file)
      if (bytes.subarray(0, 8).equals(pngSignature)) generatedImages.push(file)
    }

    if (generatedImages.length === 0) {
      console.error('CHECK_FAILED: static export emitted no generated opengraph-image PNG')
      process.exitCode = 2
    } else {
      const relativeImages = generatedImages.map((file) => path.relative(outputDir, file))
      const extensionless = relativeImages.filter((file) => path.extname(file) === '')
      console.log(`Generated Open Graph PNGs: ${relativeImages.join(', ')}`)

      if (extensionless.length > 0) {
        console.log(`SYMPTOM_PRESENT: extensionless generated PNGs: ${extensionless.join(', ')}`)
        process.exitCode = 0
      } else {
        console.log('SYMPTOM_ABSENT: every generated Open Graph PNG has a file extension')
        process.exitCode = 1
      }
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
}
