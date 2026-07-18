import ts from 'typescript'

const configPath = ts.findConfigFile(process.cwd(), ts.sys.fileExists, 'tsconfig.json')
if (!configPath) {
  console.error('check failed: tsconfig.json was not found')
  process.exitCode = 2
} else {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile)
  if (configFile.error) {
    console.error(ts.formatDiagnosticsWithColorAndContext([configFile.error], formatHost()))
    process.exitCode = 2
  } else {
    const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd())
    const program = ts.createProgram(parsed.fileNames, parsed.options)
    const diagnostics = ts.getPreEmitDiagnostics(program)
    const sourceDiagnostics = diagnostics.filter((diagnostic) =>
      diagnostic.file?.fileName.endsWith('redirect-check.ts')
    )
    const attemptedLiteralError = sourceDiagnostics.find((diagnostic) => {
      if (!diagnostic.file || diagnostic.start === undefined) return false
      const line = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      return line === 3 && diagnostic.code === 2345 && message.includes('RedirectType')
    })
    const unexpected = diagnostics.filter((diagnostic) => diagnostic !== attemptedLiteralError)

    if (attemptedLiteralError && unexpected.length === 0) {
      console.log('symptom present: redirect(url, "push") is rejected as not assignable to RedirectType, while RedirectType.push compiles')
      process.exitCode = 0
    } else if (!attemptedLiteralError && diagnostics.length === 0) {
      console.log('symptom absent: both the string literal and RedirectType.push compile')
      process.exitCode = 1
    } else {
      console.error('check failed: compiler diagnostics did not match the reported symptom')
      console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost()))
      process.exitCode = 2
    }
  }
}

function formatHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => ts.sys.newLine,
  }
}
