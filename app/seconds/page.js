import * as nextCache from 'next/cache'

const cacheLife = nextCache.cacheLife ?? nextCache.unstable_cacheLife

async function CachedContent() {
  'use cache'
  cacheLife('seconds')
  return <p>seconds content</p>
}

export default async function Page() {
  return (
    <main>
      <h1>Seconds</h1>
      <CachedContent />
    </main>
  )
}
