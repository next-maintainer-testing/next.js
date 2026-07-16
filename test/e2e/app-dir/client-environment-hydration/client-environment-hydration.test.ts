import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/83102
// A server-only environment variable creates a hydration mismatch in this
// element-free Client Component. The server text must not survive navigation.
describe('client environment hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      SECRET: 'my-secret-string',
    },
  })

  it('removes mismatched server text before navigating away', async () => {
    expect(await next.render('/client')).toContain('my-secret-string')

    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/client"]').click()
    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/client')
    })

    await browser.refresh()
    await browser.back()

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/')
      expect(await browser.eval('document.body.innerText')).toBe(
        'Go to client page'
      )
    })
  })
})
