import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { createTSPlugin } = require('next/dist/server/typescript')
const root = process.cwd()
let languageService

function finish(code, details) {
  process.exitCode = code
  console.log(JSON.stringify(details, null, 2))
  languageService?.dispose()
}

try {
  const configPath = path.join(root, 'tsconfig.json')
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }

  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root)
  const host = {
    getScriptFileNames: () => parsed.fileNames,
    getScriptVersion: () => '0',
    getScriptSnapshot(fileName) {
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
  }

  languageService = ts.createLanguageService(host, ts.createDocumentRegistry())
  const plugin = createTSPlugin({ typescript: ts }).create({
    languageService,
    languageServiceHost: host,
    serverHost: ts.sys,
    project: {
      getCurrentDirectory: () => root,
      projectService: { logger: { info() {} } },
    },
    config: { name: 'next' },
  })

  const diagnosticsFor = (relativePath) =>
    plugin.getSemanticDiagnostics(path.join(root, relativePath)).map((diagnostic) => ({
      code: diagnostic.code,
      category: diagnostic.category,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    }))

  const pageDiagnostics = diagnosticsFor('app/page.tsx')
  const routeDiagnostics = diagnosticsFor('app/api/route.ts')
  const isInvalidRevalidate = (diagnostic) =>
    diagnostic.code === 71003 &&
    diagnostic.category === ts.DiagnosticCategory.Error &&
    diagnostic.message.includes('not a valid value for the "revalidate" option')
  const pageHasError = pageDiagnostics.some(isInvalidRevalidate)
  const routeHasError = routeDiagnostics.some(isInvalidRevalidate)
  const details = {
    nextVersion: require('next/package.json').version,
    pageHasInvalidRevalidateError: pageHasError,
    routeHasInvalidRevalidateError: routeHasError,
    pageDiagnostics,
    routeDiagnostics,
  }

  if (!pageHasError) {
    finish(2, { ...details, checkFailure: 'The Next.js TypeScript plugin did not report the control error in app/page.tsx.' })
  } else if (!routeHasError) {
    finish(0, { ...details, symptom: 'The plugin reports invalid revalidate in page.tsx but omits it in app/api/route.ts.' })
  } else {
    finish(1, { ...details, symptomAbsent: 'The plugin reports invalid revalidate in both page.tsx and app/api/route.ts.' })
  }
} catch (error) {
  finish(2, { checkFailure: error instanceof Error ? error.stack : String(error) })
}
