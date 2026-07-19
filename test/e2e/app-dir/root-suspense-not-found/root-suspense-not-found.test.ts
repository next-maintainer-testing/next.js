import { nextTestSetup } from 'e2e-utils'

// Regression test for https://github.com/vercel/next.js/issues/59521

describe('root suspense not-found', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should return a 404 status when notFound() suspends below the root layout', async () => {
    const res = await next.fetch('/missing')
    const html = await res.text()

    expect(html).toContain('Custom not found')
    expect(res.status).toBe(404)
  })
})
