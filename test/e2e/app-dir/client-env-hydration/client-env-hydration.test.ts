import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/83102.
describe('client environment variable hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    env: {
      SECRET: 'my-secret-string',
    },
  })

  it('removes server-only environment variable text after hydration and navigation', async () => {
    const browser = await next.browser('/')

    await browser.elementByCss('a[href="/client"]').click()
    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/client')
    })

    await browser.refresh()
    await browser.back().waitForElementByCss('a[href="/client"]')

    expect(await browser.eval('document.body.innerText')).not.toContain(
      'my-secret-string'
    )
  })
})
