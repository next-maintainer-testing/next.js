import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const fileName = path.join(root, 'next.config.ts')
const source = fs.readFileSync(fileName, 'utf8')
const propertyOffset = source.indexOf('cacheComponents')

if (propertyOffset === -1) {
  console.error('check failed: cacheComponents usage is missing')
  process.exitCode = 2
} else {
  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
  }

  const host = {
    getScriptFileNames: () => [fileName],
    getScriptVersion: () => '0',
    getScriptSnapshot: (name) => {
      if (!fs.existsSync(name)) return undefined
      return ts.ScriptSnapshot.fromString(fs.readFileSync(name, 'utf8'))
    },
    getCurrentDirectory: () => root,
    getCompilationSettings: () => compilerOptions,
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

  const languageService = ts.createLanguageService(host)
  const quickInfo = languageService.getQuickInfoAtPosition(
    fileName,
    propertyOffset + 2
  )

  if (!quickInfo) {
    console.error('check failed: TypeScript returned no editor Quick Info')
    process.exitCode = 2
  } else {
    const display = ts.displayPartsToString(quickInfo.displayParts)
    const documentation = ts.displayPartsToString(quickInfo.documentation)
    console.log(JSON.stringify({ display, documentation }, null, 2))

    if (!display.includes('NextConfig.cacheComponents')) {
      console.error('check failed: Quick Info did not resolve NextConfig.cacheComponents')
      process.exitCode = 2
    } else {
      const misleadingTextIsShown =
        documentation.includes('automatically cache') &&
        documentation.includes('page-level components and functions')
      process.exitCode = misleadingTextIsShown ? 0 : 1
    }
  }

  languageService.dispose()
}
