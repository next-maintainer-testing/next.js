import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/77322

describe('ISR loading boundary', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('streams loading.tsx while generating a dynamic ISR path', async () => {
    const startedFile = '.isr-loading-started'
    const releaseFile = '.isr-loading-release'

    await next.deleteFile(startedFile)
    await next.deleteFile(releaseFile)

    let firstChunk = ''
    const responsePromise = next
      .fetch('/ticker/unbuilt')
      .then(async (response) => {
        const chunks: Buffer[] = []

        for await (const chunk of response.body) {
          const buffer = Buffer.from(chunk)
          firstChunk ||= buffer.toString()
          chunks.push(buffer)
        }

        return {
          response,
          body: Buffer.concat(chunks).toString(),
        }
      })
    let result: Awaited<typeof responsePromise> | undefined

    await retry(async () => {
      expect(await next.hasFile(startedFile)).toBe(true)
    })

    try {
      await retry(
        () => {
          expect(firstChunk).toContain('Loading ticker...')
          expect(firstChunk).not.toContain('Ticker unbuilt')
        },
        3000,
        100,
        'for the loading boundary to stream'
      )
    } finally {
      await next.patchFile(releaseFile, 'release')
      result = await responsePromise
      await next.deleteFile(startedFile)
      await next.deleteFile(releaseFile)
    }

    expect(result.response.status).toBe(200)
    expect(result.body).toContain('Ticker unbuilt')
  })
})
