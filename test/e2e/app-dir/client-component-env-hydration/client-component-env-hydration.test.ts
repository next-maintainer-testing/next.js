import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'

// Regression test for https://github.com/vercel/next.js/issues/83102.
describe('client component environment variable hydration', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('removes server-only environment variable text after hydration and back navigation', async () => {
    const $ = await next.render$('/client')
    expect($('body').text()).toContain('My secret is: my-secret-string')

    const browser = await next.browser('/')
    await browser.elementByCss('a[href="/client"]').click()

    await retry(async () => {
      expect(new URL(await browser.url()).pathname).toBe('/client')
    })

    await browser.refresh()
    await browser.waitForCondition('window.__NEXT_HYDRATED === true')
    await browser.back()
    await browser.waitForElementByCss('a[href="/client"]')

    await retry(async () => {
      expect(await browser.eval('document.body.innerText')).not.toContain(
        'my-secret-string'
      )
    })
  })
})
