// https://github.com/vercel/next.js/issues/87737
import { nextTestSetup } from 'e2e-utils'

describe('instrumentation external package deployment', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@opentelemetry/auto-instrumentations-node': '0.67.3',
    },
    skipStart: true,
  })

  it('starts when the deployment excludes generated node_modules', async () => {
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    // Deployment archives commonly reinstall the root node_modules instead of
    // preserving build-specific aliases generated under .next/node_modules.
    await next.deleteFile('.next/node_modules')
    await next.start({ skipBuild: true })

    const $ = await next.render$('/')
    expect($('main').text()).toBe('instrumentation loaded')
  })
})
