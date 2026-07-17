import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

try {
  const nextPackagePath = require.resolve('next/package.json')
  const runtimePackagePath = path.join(
    path.dirname(nextPackagePath),
    'dist',
    'compiled',
    '@babel',
    'runtime',
    'package.json'
  )
  const runtimePackage = JSON.parse(await readFile(runtimePackagePath, 'utf8'))
  const symptomPresent = runtimePackage.version === '7.22.5'

  console.log(
    `Next.js bundled @babel/runtime version: ${runtimePackage.version}; ` +
      `reported vulnerable version 7.22.5 is ${symptomPresent ? 'present' : 'absent'}`
  )
  process.exitCode = symptomPresent ? 0 : 1
} catch (error) {
  console.error(`Unable to inspect Next.js bundled @babel/runtime: ${error.stack || error}`)
  process.exitCode = 2
}
