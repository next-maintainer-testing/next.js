import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function readInstalledVersion(packageName) {
  let directory = dirname(require.resolve(packageName))

  while (true) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
      if (manifest.name === packageName) return manifest.version
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }

    const parent = dirname(directory)
    if (parent === directory) throw new Error(`Could not find package.json for ${packageName}`)
    directory = parent
  }
}

try {
  const nextVersion = readInstalledVersion('next')
  const eslintConfigVersion = readInstalledVersion('eslint-config-next')

  if (nextVersion !== eslintConfigVersion) {
    console.error(
      `CHECK_FAILED: next (${nextVersion}) and eslint-config-next (${eslintConfigVersion}) do not match`
    )
    process.exitCode = 2
  } else {
    try {
      const typescriptConfig = require.resolve('eslint-config-next/typescript')
      console.log(
        `SYMPTOM_ABSENT: eslint-config-next@${eslintConfigVersion} exposes next/typescript at ${typescriptConfig}`
      )
      process.exitCode = 1
    } catch (error) {
      if (error?.code === 'MODULE_NOT_FOUND' || error?.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
        console.log(
          `SYMPTOM_PRESENT: eslint-config-next@${eslintConfigVersion} does not expose next/typescript`
        )
        process.exitCode = 0
      } else {
        throw error
      }
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
  process.exitCode = 2
}
