import { nextTestSetup } from 'e2e-utils'

// Reproduces https://github.com/vercel/next.js/issues/84960
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'Turbopack root file tracing',
  () => {
    const { next, skipped } = nextTestSetup({
      files: __dirname,
      dependencies: {
        '@sentry/nextjs': '10.20.0',
      },
      skipStart: true,
      skipDeployment: true,
    })

    if (skipped) return

    it('does not include unrelated root files in page traces', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      const { files } = await next.readJSON('.next/server/app/page.js.nft.json')

      expect(
        files.some((file: string) =>
          file.replaceAll('\\', '/').endsWith('/unrelated-marker.txt')
        )
      ).toBe(false)
    })
  }
)
