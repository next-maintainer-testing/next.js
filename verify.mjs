import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

try {
  const nextPackagePath = require.resolve('next/package.json')
  const nextPackage = JSON.parse(await readFile(nextPackagePath, 'utf8'))
  const redirectPath = join(
    dirname(nextPackagePath),
    'dist/esm/client/components/redirect.js'
  )
  const source = await readFile(redirectPath, 'utf8')
  const declarationIndex = source.indexOf('export function redirect')

  if (declarationIndex === -1) {
    console.error(`Check failed: redirect declaration was not found in Next.js ${nextPackage.version}`)
    process.exitCode = 2
  } else {
    const commentStart = source.lastIndexOf('/**', declarationIndex)
    const commentEnd = source.indexOf('*/', commentStart)

    if (commentStart === -1 || commentEnd === -1 || commentEnd > declarationIndex) {
      console.error(`Check failed: redirect documentation block was not found in Next.js ${nextPackage.version}`)
      process.exitCode = 2
    } else {
      const docs = source.slice(commentStart, commentEnd + 2)
      const describesSupportedContexts =
        docs.includes('Server Components') &&
        docs.includes('Route Handlers') &&
        docs.includes('Server Actions')
      const mentionsClientComponents = /Client Components?/i.test(docs)

      if (!describesSupportedContexts) {
        console.error(`Check failed: redirect context documentation had an unexpected format in Next.js ${nextPackage.version}`)
        process.exitCode = 2
      } else if (!mentionsClientComponents) {
        console.log(`Symptom present in Next.js ${nextPackage.version}: redirect inline documentation lists Server Components, Route Handlers, and Server Actions, but omits Client Components.`)
        process.exitCode = 0
      } else {
        console.log(`Symptom absent in Next.js ${nextPackage.version}: redirect inline documentation mentions Client Components.`)
        process.exitCode = 1
      }
    }
  }
} catch (error) {
  console.error('Check failed:', error)
  process.exitCode = 2
}
