import { nextTestSetup } from 'e2e-utils'
import {
  computeCacheBustingSearchParam,
  computeLegacyCacheBustingSearchParam,
} from 'next/dist/shared/lib/router/utils/cache-busting-search-param'

// Regression test for https://github.com/vercel/next.js/issues/92907

describe('app dir - validation', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should error when passing invalid router state tree', async () => {
    const stateTree1 = JSON.stringify(['', ''])
    const stateTree2 = JSON.stringify(['', {}])

    const headers1 = {
      rsc: '1',
      'next-router-state-tree': stateTree1,
    }

    const headers2 = {
      rsc: '1',
      'next-router-state-tree': stateTree2,
    }

    const url1 = new URL('/', 'http://localhost')
    const url2 = new URL('/', 'http://localhost')

    // Add cache busting search param for both requests
    const cacheBustingParam1 = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      stateTree1,
      undefined
    )
    const cacheBustingParam2 = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      stateTree2,
      undefined
    )

    if (cacheBustingParam1) {
      url1.searchParams.set('_rsc', cacheBustingParam1)
    }
    if (cacheBustingParam2) {
      url2.searchParams.set('_rsc', cacheBustingParam2)
    }

    const res = await next.fetch(url1.toString(), { headers: headers1 })
    expect(res.status).toBe(500)

    const res2 = await next.fetch(url2.toString(), { headers: headers2 })
    expect(res2.status).toBe(200)
  })

  it('should accept router state trees emitted by older clients', async () => {
    // Next.js 16.1 emitted `true` as the fifth tuple entry. A newer server must
    // handle this stale client state without failing the soft navigation.
    const stateTree = encodeURIComponent(
      JSON.stringify([
        '',
        {
          children: [
            'about',
            { children: ['__PAGE__', {}, null, null] },
            null,
            null,
          ],
        },
        null,
        null,
        true,
      ])
    )
    const headers = {
      accept: 'text/x-component',
      rsc: '1',
      'next-router-prefetch': '1',
      'next-router-state-tree': stateTree,
      'next-url': '/',
    } as const
    const url = new URL('/about', 'http://localhost')
    const cacheBustingParam = await computeCacheBustingSearchParam(
      headers['next-router-prefetch'],
      undefined,
      headers['next-router-state-tree'],
      headers['next-url']
    )
    if (cacheBustingParam) {
      url.searchParams.set('_rsc', cacheBustingParam)
    }

    const outputStart = next.cliOutput.length
    const res = await next.fetch(url.toString(), { headers })

    expect(res.status).toBe(200)
    expect(await res.text()).toContain('About')
    expect(next.cliOutput.slice(outputStart)).not.toContain(
      'The router state header was sent but could not be parsed'
    )
  })

  it('should generate distinct cache-busting params for known colliding RSC variants', async () => {
    const stateTree = '%5B%22%22%2C%7B%7D%5D'

    const fullRequestHash = await computeCacheBustingSearchParam(
      undefined,
      undefined,
      stateTree,
      undefined
    )
    const prefetchRequestHash = await computeCacheBustingSearchParam(
      '1',
      '/_tree',
      stateTree,
      '/pcsta0'
    )

    expect(fullRequestHash).toHaveLength(16)
    expect(prefetchRequestHash).toHaveLength(16)
    expect(fullRequestHash).not.toBe(prefetchRequestHash)
  })

  it('should accept legacy cache-busting params on plain HTTP requests', async () => {
    const stateTree = '%5B%22%22%2C%7B%7D%5D'
    const url = new URL('/', 'http://localhost')
    const headers = {
      rsc: '1',
      'next-router-state-tree': stateTree,
    }

    url.searchParams.set(
      '_rsc',
      computeLegacyCacheBustingSearchParam(
        undefined,
        undefined,
        stateTree,
        undefined
      )
    )

    const res = await next.fetch(url.toString(), {
      headers,
      redirect: 'manual',
    })

    expect(res.status).toBe(200)
  })
})
