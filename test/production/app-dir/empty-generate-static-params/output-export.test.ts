// Regression test for https://github.com/vercel/next.js/issues/61213

import { nextTestSetup } from 'e2e-utils'

describe('empty-generate-static-params with output export', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    overrideFiles: {
      'next.config.js': `module.exports = { output: 'export' }`,
    },
    skipStart: true,
  })

  if (process.env.__NEXT_CACHE_COMPONENTS === 'true') {
    return it.skip('not applicable with Cache Components', () => {
      // Cache Components requires generateStaticParams to return at least one
      // result and is not compatible with `output: 'export'`.
    })
  }

  it('should build when generateStaticParams returns an empty array', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
  })
})
