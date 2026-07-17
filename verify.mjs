import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const root = path.dirname(new URL(import.meta.url).pathname)
const ts = require('typescript')
const targetFile = path.join(root, 'app', 'page.tsx')
const warning = 'The Next.js "metadata" export should be type of "Metadata" from "next".'

try {
  const configPath = path.join(root, 'tsconfig.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
  const versions = new Map()
  for (const fileName of parsed.fileNames) versions.set(fileName, '0')

  const host = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: (fileName) => versions.get(fileName) ?? '0',
    getScriptSnapshot: (fileName) => {
      if (!fs.existsSync(fileName)) return undefined
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fileName, 'utf8'))
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => parsed.options,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
    getNewLine: () => ts.sys.newLine,
  }

  const languageService = ts.createLanguageService(host, ts.createDocumentRegistry())
  const { createTSPlugin } = require('next/dist/server/typescript/index')
  if (typeof createTSPlugin !== 'function') {
    throw new Error('Next.js TypeScript plugin entry did not export createTSPlugin')
  }
  const info = {
    config: { name: 'next', enabled: true },
    languageService,
    project: {
      getCurrentDirectory: () => root,
      projectService: { logger: { info: () => {} } },
    },
  }
  const plugin = createTSPlugin({ typescript: ts }).create(info)
  const diagnostics = plugin.getSemanticDiagnostics(targetFile)
  const messages = diagnostics.map((diagnostic) =>
    ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
  )
  const reproduced = messages.includes(warning)
  const nextVersion = require('next/package.json').version
  console.log(JSON.stringify({ nextVersion, reproduced, warning, diagnostics: messages }, null, 2))
  process.exitCode = reproduced ? 0 : 1
  languageService.dispose()
} catch (error) {
  console.error(error?.stack || String(error))
  process.exitCode = 2
}
