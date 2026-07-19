import { existsSync, readFileSync, rmSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { spawnSync } from 'node:child_process'

const LIMIT = 1024 * 1024

function finish(code, details) {
  process.exitCode = code
  console.log(JSON.stringify(details))
}

try {
  rmSync('.next', { recursive: true, force: true })
  const build = spawnSync('npm', ['run', 'build'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: '1',
      FORCE_COLOR: '0',
      NO_COLOR: '1',
    },
    timeout: 270_000,
  })
  const output = `${build.stdout || ''}\n${build.stderr || ''}`
  const cleanOutput = output.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')

  if (build.error || build.status !== 0) {
    finish(2, {
      error: build.error?.message || `next build exited ${build.status}`,
      output: cleanOutput.slice(-4000),
    })
  } else {
    const manifestPath = '.next/server/middleware-manifest.json'
    if (!existsSync(manifestPath)) {
      finish(2, { error: 'next build did not create middleware-manifest.json' })
    } else {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const entry = Object.values(manifest.middleware || {})[0]
      if (!entry || !Array.isArray(entry.files) || entry.files.length === 0) {
        finish(2, { error: 'middleware manifest contains no deployable files' })
      } else {
        const executable = entry.files.map((file) => `.next/${file}`)
        const maps = executable.map((file) => `${file}.map`).filter(existsSync)
        const compressedExecutableBytes = executable.reduce(
          (sum, file) => sum + gzipSync(readFileSync(file)).length,
          0,
        )
        const compressedSourceMapBytes = maps.reduce(
          (sum, file) => sum + gzipSync(readFileSync(file)).length,
          0,
        )
        const compressedDeploymentBytes =
          compressedExecutableBytes + compressedSourceMapBytes
        const summary = cleanOutput.match(
          /(?:Middleware|Proxy)\s+([0-9.]+)\s*(kB|MB|B)/i,
        )

        if (!summary) {
          finish(2, {
            error: 'could not read the middleware size from next build output',
            output: cleanOutput.slice(-4000),
          })
        } else {
          const symptomPresent =
            compressedExecutableBytes < LIMIT &&
            compressedDeploymentBytes > LIMIT &&
            maps.length > 0
          finish(symptomPresent ? 0 : 1, {
            buildSummary: `${summary[1]} ${summary[2]}`,
            compressedExecutableBytes,
            compressedSourceMapBytes,
            compressedDeploymentBytes,
            planLimitBytes: LIMIT,
            sourceMaps: maps.length,
            symptomPresent,
          })
        }
      }
    }
  }
} catch (error) {
  finish(2, { error: error instanceof Error ? error.stack : String(error) })
}
