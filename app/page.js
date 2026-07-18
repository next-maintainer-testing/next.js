import { unstable_cache } from 'next/cache'

export const dynamic = 'force-dynamic'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getCachedValue = unstable_cache(
  async () => {
    await delay(750)
    return `${Date.now()}-${Math.random()}`
  },
  ['issue-79307-cache-key'],
  { revalidate: 5 }
)

export default async function Page() {
  const value = await getCachedValue()

  return (
    <main>
      <h1>unstable_cache value</h1>
      <div id="cache-value">{value}</div>
    </main>
  )
}
