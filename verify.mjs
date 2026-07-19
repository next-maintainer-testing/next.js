import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nextVersion = require('next/package.json').version
const root = await mkdtemp(join(tmpdir(), 'next-56780-'))
let exitCode = 2

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: options.env ?? process.env,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    let stdout = ''
    let stderr = ''
    if (options.capture) {
      child.stdout.on('data', (chunk) => { stdout += chunk })
      child.stderr.on('data', (chunk) => { stderr += chunk })
    }
    child.on('error', reject)
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

try {
  const downloadDir = join(root, 'download')
  const cliDir = join(root, 'cli')
  const fakeBin = join(root, 'fake-bin')
  const appDir = join(root, 'generated-app')
  await Promise.all([mkdir(downloadDir), mkdir(cliDir), mkdir(fakeBin)])

  const packed = await run('npm', [
    'pack', `create-next-app@${nextVersion}`, '--json', '--pack-destination', downloadDir,
  ], { capture: true })
  if (packed.code !== 0) {
    console.error(`CHECK_FAILED: could not download create-next-app@${nextVersion}`)
    console.error(packed.stderr)
  } else {
    const records = JSON.parse(packed.stdout)
    const tarball = join(downloadDir, records[0].filename)
    const extracted = await run('tar', ['-xzf', tarball, '-C', cliDir])
    if (extracted.code !== 0) {
      console.error('CHECK_FAILED: could not extract create-next-app')
    } else {
      const fakeNpm = join(fakeBin, 'npm')
      await writeFile(fakeNpm, '#!/bin/sh\nexit 0\n')
      await chmod(fakeNpm, 0o755)
      const env = {
        ...process.env,
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
        XDG_CONFIG_HOME: join(root, 'config'),
        PATH: `${fakeBin}${delimiter}${process.env.PATH}`,
      }
      const scaffold = await run(process.execPath, [
        join(cliDir, 'package', 'dist', 'index.js'),
        appDir,
        '--ts',
        '--eslint',
        '--tailwind',
        '--app',
        '--import-alias',
        '@/app/*',
        '--use-npm',
      ], { env, capture: true })

      if (scaffold.code !== 0) {
        console.error(`CHECK_FAILED: create-next-app@${nextVersion} exited ${scaffold.code}`)
        console.error(scaffold.stdout)
        console.error(scaffold.stderr)
      } else {
        const generatedConfig = JSON.parse(await readFile(join(appDir, 'tsconfig.json'), 'utf8'))
        if (!generatedConfig.compilerOptions?.paths?.['@/app/*']) {
          console.error('CHECK_FAILED: create-next-app did not generate the requested alias')
        } else {
          await writeFile(join(appDir, 'verify-entry.ts'), "import { value } from '@/app/probe'\nvoid value\n")
          await writeFile(join(appDir, 'app', 'probe.ts'), 'export const value = 1\n')
          await writeFile(join(appDir, 'tsconfig.verify.json'), JSON.stringify({
            extends: './tsconfig.json',
            compilerOptions: {
              incremental: false,
              noEmit: true,
              skipLibCheck: true,
              types: [],
            },
            files: ['./verify-entry.ts', './app/probe.ts'],
            include: [],
          }, null, 2))

          const typecheck = await run(process.execPath, [
            require.resolve('typescript/bin/tsc'),
            '--project',
            join(appDir, 'tsconfig.verify.json'),
            '--pretty',
            'false',
          ], { capture: true })
          const output = `${typecheck.stdout}\n${typecheck.stderr}`
          const hasReportedError = /verify-entry\.ts\(1,23\): error TS2307: Cannot find module '@\/app\/probe'/.test(output)
          if (hasReportedError) {
            console.log(`REPRODUCED: create-next-app@${nextVersion} generated @/app/* so @/app/probe fails with TS2307 while app/probe.ts exists.`)
            exitCode = 0
          } else if (typecheck.code === 0) {
            console.log(`NOT_REPRODUCED: create-next-app@${nextVersion} generated an alias that resolves @/app/probe to app/probe.ts.`)
            exitCode = 1
          } else {
            console.error('CHECK_FAILED: TypeScript failed for an unexpected reason')
            console.error(output)
          }
        }
      }
    }
  }
} catch (error) {
  console.error('CHECK_FAILED:', error)
} finally {
  process.exitCode = exitCode
  await rm(root, { recursive: true, force: true })
}
