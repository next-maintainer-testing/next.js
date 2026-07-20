import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname)
const imagePath = join(root, 'public', 'animated.png')
const outputPath = join(root, '.next')

function collectJavaScriptFiles(directory, files = []) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) collectJavaScriptFiles(path, files)
    else if (path.endsWith('.js')) files.push(path)
  }
  return files
}

try {
  const nextVersion = JSON.parse(
    readFileSync(join(root, 'node_modules', 'next', 'package.json'), 'utf8')
  ).version
  const major = Number.parseInt(nextVersion.split('.')[0], 10)
  const args = ['build']
  // Next 16 defaults to Turbopack; this issue specifically concerns the
  // Webpack static-image loader used by both the reported and current release.
  if (major >= 16) args.push('--webpack')

  rmSync(outputPath, { recursive: true, force: true })
  const build = spawnSync(join(root, 'node_modules', '.bin', 'next'), args, {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    timeout: 240_000,
  })

  if (build.error || build.status !== 0) {
    console.error('Next.js production build failed')
    if (build.error) console.error(build.error)
    console.error(build.stdout)
    console.error(build.stderr)
    process.exitCode = 2
  } else {
    const encodedImage = readFileSync(imagePath).toString('base64')
    const chunksDirectory = join(outputPath, 'static', 'chunks')
    const matches = collectJavaScriptFiles(chunksDirectory).filter((file) =>
      readFileSync(file, 'utf8').includes(encodedImage)
    )
    const imageBytes = readFileSync(imagePath).byteLength

    if (matches.length > 0) {
      console.log(
        `SYMPTOM_PRESENT: full ${imageBytes}-byte animated PNG is embedded in browser JS: ${matches
          .map((file) => file.slice(root.length + 1))
          .join(', ')}`
      )
      process.exitCode = 0
    } else {
      console.log(
        `SYMPTOM_ABSENT: full ${imageBytes}-byte animated PNG is not embedded in any browser JS chunk`
      )
      process.exitCode = 1
    }
  }
} catch (error) {
  console.error('Verification failed before a symptom determination')
  console.error(error)
  process.exitCode = 2
}
