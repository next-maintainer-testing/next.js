// Reproduces https://github.com/vercel/next.js/issues/84960
import { readdir } from 'fs/promises'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack trace unrelated root files',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@sentry/nextjs': '10.20.0',
      },
      skipStart: true,
    })

    it('does not include unrelated root files in page traces', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const serverDir = path.join(next.testDir, '.next/server')
      const traceFiles = (await readdir(serverDir, { recursive: true })).filter(
        (file) => file.endsWith('.js.nft.json')
      )
      expect(traceFiles.length).toBeGreaterThan(0)

      const markerTracedBy = []
      for (const traceFile of traceFiles) {
        const trace = await next.readJSON(path.join('.next/server', traceFile))
        if (
          trace.files.some((file: string) =>
            file.replaceAll('\\', '/').endsWith('/TRACE_UNRELATED_MARKER.txt')
          )
        ) {
          markerTracedBy.push(traceFile)
        }
      }

      expect(markerTracedBy).toEqual([])
    })
  }
)
