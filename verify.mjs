import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', reject)
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

let workspace
let exitCode = 2
try {
  const nextPackagePath = require.resolve('next/package.json')
  const nextPackage = JSON.parse(await readFile(nextPackagePath, 'utf8'))
  const nextVersion = nextPackage.version
  const major = Number(nextVersion.split('.')[0])
  const configVersion = nextVersion === '13.2.5-canary.1' ? '13.2.4' : nextVersion
  const eslintVersion = major >= 16 ? '9.39.2' : '8.57.1'
  const reactVersion = major >= 16 ? '19.2.4' : '18.2.0'

  workspace = await mkdtemp(join(tmpdir(), 'next-47047-'))
  await writeFile(join(workspace, 'package.json'), JSON.stringify({
    private: true,
    type: 'module',
    dependencies: {
      eslint: eslintVersion,
      'eslint-config-next': configVersion,
      next: nextVersion,
      react: reactVersion,
      'react-dom': reactVersion,
    },
  }, null, 2))
  await writeFile(join(workspace, 'page.js'), 'export default function Page() { return <a href="/about">About</a> }\n')

  if (major >= 16) {
    await writeFile(join(workspace, 'eslint.config.mjs'), [
      "import { defineConfig } from 'eslint/config'",
      "import nextVitals from 'eslint-config-next/core-web-vitals'",
      'export default defineConfig([...nextVitals])',
      '',
    ].join('\n'))
  } else {
    await writeFile(join(workspace, '.eslintrc.json'), JSON.stringify({ extends: 'next/core-web-vitals' }, null, 2))
  }

  const install = await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: workspace })
  if (install.code !== 0 || install.signal) {
    console.error(`Dependency installation failed for eslint-config-next@${configVersion}.`)
    console.error(install.stderr || install.stdout)
    exitCode = 2
  } else {
    const lint = await run(join(workspace, 'node_modules', '.bin', 'eslint'), ['page.js'], { cwd: workspace })
    const output = `${lint.stdout}\n${lint.stderr}`
    if (lint.code !== 0 || lint.signal) {
      console.error(`ESLint execution failed for eslint-config-next@${configVersion}.`)
      console.error(output)
      exitCode = 2
    } else {
      const symptomPresent = output.includes('Pages directory cannot be found at') &&
        output.includes('no-html-link-for-pages')
      console.log(`next=${nextVersion} eslint-config-next=${configVersion}`)
      console.log(symptomPresent
        ? 'Observed the erroneous Pages directory cannot be found diagnostic.'
        : 'The erroneous Pages directory cannot be found diagnostic was absent.')
      if (output.trim()) console.log(output.trim())
      exitCode = symptomPresent ? 0 : 1
    }
  }
} catch (error) {
  console.error(error?.stack || error)
  exitCode = 2
} finally {
  process.exitCode = exitCode
  if (workspace) await rm(workspace, { recursive: true, force: true })
}
