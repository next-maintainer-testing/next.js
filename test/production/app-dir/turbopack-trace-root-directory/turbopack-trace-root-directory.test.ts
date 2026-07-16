// Regression test for https://github.com/vercel/next.js/issues/84960
import { readdir } from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'

async function filesBelow(dir: string): Promise<string[]> {
  const files = []

  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    files.push(...(entry.isDirectory() ? await filesBelow(file) : [file]))
  }

  return files
}

;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack trace root directory',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@sentry/nextjs': '10.20.0',
      },
      skipStart: true,
    })

    if (skipped) return

    it('does not include unrelated root files in page traces', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const serverDir = path.join(next.testDir, '.next/server')
      const traceFiles = (await filesBelow(serverDir)).filter((file) =>
        file.endsWith('.js.nft.json')
      )
      const markerTracedBy = []

      expect(traceFiles.length).toBeGreaterThan(0)

      for (const traceFile of traceFiles) {
        const trace = await next.readJSON(
          path.relative(next.testDir, traceFile)
        )
        if (
          trace.files.some((file: string) =>
            file.replaceAll('\\', '/').endsWith('/TRACE_UNRELATED_MARKER.txt')
          )
        ) {
          markerTracedBy.push(path.relative(serverDir, traceFile))
        }
      }

      expect(markerTracedBy).toEqual([])
    })
  }
)
