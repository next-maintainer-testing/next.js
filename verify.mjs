import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const docsUrl = 'https://nextjs.org/docs/14/getting-started/installation'
const misleadingCommand = 'create-next-app@latest'

async function main() {
  const installedNext = require('next/package.json').version
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const response = await fetch(docsUrl, {
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Documentation request returned HTTP ${response.status}`)
    }

    const html = await response.text()
    const versionedPage = html.includes('Next.js 14') || html.includes('/docs/14/')
    const symptomPresent = versionedPage && html.includes(misleadingCommand)

    console.log(`Installed Next.js: ${installedNext}`)
    console.log(`Documentation URL: ${response.url}`)
    console.log(`Versioned Next.js 14 page: ${versionedPage}`)
    console.log(`Contains misleading @latest command: ${symptomPresent}`)

    process.exitCode = symptomPresent ? 0 : 1
  } finally {
    clearTimeout(timeout)
  }
}

try {
  await main()
} catch (error) {
  console.error(error instanceof Error ? error.stack : error)
  process.exitCode = 2
}
