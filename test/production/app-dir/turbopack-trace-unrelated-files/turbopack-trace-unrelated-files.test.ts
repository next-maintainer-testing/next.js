// Regression test for https://github.com/vercel/next.js/issues/84960
import { nextTestSetup } from 'e2e-utils'
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'turbopack trace unrelated files',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@sentry/nextjs': '10.20.0',
      },
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) {
      return
    }

    it('does not include unrelated root files in page traces', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const trace = await next.readJSON('.next/server/app/page.js.nft.json')

      expect(
        trace.files.some((file: string) =>
          file.replaceAll('\\', '/').endsWith('/TRACE_UNRELATED_MARKER.txt')
        )
      ).toBe(false)
    })
  }
)
