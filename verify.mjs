import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = process.cwd()

function finish(code, message, details = {}) {
  console.log(JSON.stringify({ message, ...details }))
  process.exitCode = code
}

try {
  fs.rmSync(path.join(root, '.next'), { recursive: true, force: true })

  const nextBin = require.resolve('next/dist/bin/next')
  const build = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: root,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    encoding: 'utf8',
    timeout: 240_000,
  })

  if (build.error || build.status !== 0) {
    finish(2, 'next build failed', {
      status: build.status,
      error: build.error?.message ?? null,
      stdout: build.stdout?.slice(-4000) ?? '',
      stderr: build.stderr?.slice(-4000) ?? '',
    })
  } else {
    const ts = require('typescript')
    const configPath = ts.findConfigFile(root, ts.sys.fileExists, 'tsconfig.json')
    if (!configPath) throw new Error('tsconfig.json was not found')

    const config = ts.readConfigFile(configPath, ts.sys.readFile)
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
    const probeFile = path.join(root, 'app', '__cache_completion_probe.ts')
    const probeText = 'reval\n'
    const scriptFiles = new Map(parsed.fileNames.map((fileName) => [fileName, { version: '0' }]))
    scriptFiles.set(probeFile, { version: '0' })

    const host = {
      getScriptFileNames: () => [...scriptFiles.keys()],
      getScriptVersion: (fileName) => scriptFiles.get(fileName)?.version ?? '0',
      getScriptSnapshot: (fileName) => {
        const text = fileName === probeFile ? probeText : ts.sys.readFile(fileName)
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
      },
      getCurrentDirectory: () => root,
      getCompilationSettings: () => parsed.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    }

    const service = ts.createLanguageService(host, ts.createDocumentRegistry())
    const completions = service.getCompletionsAtPosition(probeFile, 5, {
      includeCompletionsForModuleExports: true,
      includeCompletionsWithInsertText: true,
    })
    if (!completions) throw new Error('TypeScript returned no completions')

    const names = ['revalidatePath', 'revalidateTag']
    const counts = Object.fromEntries(names.map((name) => [name, completions.entries.filter(
      (entry) => entry.name === name && entry.source === 'next/cache',
    ).length]))
    const details = {
      nextVersion: require('next/package.json').version,
      reactVersion: require('react/package.json').version,
      typescriptVersion: ts.version,
      counts,
      generatedCacheTypes: fs.existsSync(path.join(root, '.next', 'types', 'cache-life.d.ts')),
    }

    if (names.every((name) => counts[name] > 1)) {
      finish(0, 'duplicate next/cache auto-import completions reproduced', details)
    } else {
      finish(1, 'next/cache auto-import completions are not duplicated', details)
    }
  }
} catch (error) {
  finish(2, 'verification check failed', {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  })
}
