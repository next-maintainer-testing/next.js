import { Suspense } from 'react'
import { cacheLife } from 'next/cache'

// The id prop is just used to assert on the logged cache key in tests.
async function DynamicCache({ id }: { id: string }) {
  'use cache'
  cacheLife('seconds')
  return <p>{new Date().toISOString()}</p>
}

// A second dynamic cache, but with an explicit `expire: 0`. In production it's
// regenerated on every read and would never be served back, so unlike the
// short-lived cache above it's not saved to the cache handler at all.
async function ExpireZeroCache({ id }: { id: string }) {
  'use cache'
  cacheLife({ expire: 0 })
  return <p id="expire-zero-value">{new Date().toISOString()}</p>
}

export default function Page() {
  return (
    <main>
      <p>
        This page uses two dynamic "use cache" functions, both omitted from the
        prerender. The short-lived one is still saved in the cache handler; the
        `expire: 0` one is not, since it would never be served back.
      </p>
      <Suspense>
        <DynamicCache id="dynamic-cache" />
      </Suspense>
      <Suspense>
        <ExpireZeroCache id="expire-zero" />
      </Suspense>
    </main>
  )
}
