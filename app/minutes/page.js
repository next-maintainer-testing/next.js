import * as nextCache from 'next/cache'

const cacheLife = nextCache.cacheLife ?? nextCache.unstable_cacheLife

async function CachedContent() {
  'use cache'
  cacheLife('minutes')
  return <p>minutes content</p>
}

export default async function Page() {
  return (
    <main>
      <h1>Minutes</h1>
      <CachedContent />
    </main>
  )
}
