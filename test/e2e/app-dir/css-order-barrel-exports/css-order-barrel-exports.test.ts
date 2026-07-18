import { nextTestSetup } from 'e2e-utils'

// https://github.com/vercel/next.js/issues/83941
describe('CSS module order across barrel exports', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      sass: '1.83.4',
    },
  })

  it('should preserve the CSS module import order', async () => {
    const browser = await next.browser('/intensive')

    expect(
      await browser
        .elementByCss('[class*="bannerCard"]')
        .getComputedCss('background-color')
    ).toBe('rgb(112, 1, 253)')
  })
})
