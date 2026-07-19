// Regression test for https://github.com/vercel/next.js/issues/61728
import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

describe('instrumentation hook runtime', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('reloads instrumentation in the Node.js runtime', async () => {
    await retry(() => {
      expect(next.cliOutput).toContain('instrumentation runtime nodejs')
    })

    const response = await next.fetch('/')
    expect(response.status).toBe(200)
    await retry(() => {
      expect(next.cliOutput).toContain('instrumentation runtime edge')
    })

    const instrumentation = await next.readFile('instrumentation.js')
    const outputIndex = next.cliOutput.length

    await next.patchFile(
      'instrumentation.js',
      `${instrumentation}\n// trigger instrumentation reload\n`,
      async () => {
        await retry(async () => {
          const response = await next.fetch('/')
          expect(response.status).toBe(200)
          expect(next.cliOutput.slice(outputIndex)).toMatch(
            /instrumentation runtime (?:nodejs|edge)/
          )
        }, 15_000)

        const reloadOutput = next.cliOutput.slice(outputIndex)
        expect(reloadOutput).toContain('instrumentation runtime nodejs')
        expect(reloadOutput).not.toContain('instrumentation runtime edge')
      }
    )
  })
})
