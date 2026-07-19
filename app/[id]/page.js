import { unstable_cache } from 'next/cache'

export const dynamic = 'force-static'
export const generateStaticParams = () => []

const getCachedValue = unstable_cache(
  async () => `CACHE_VALUE_${Date.now()}`,
  ['issue-76769-value'],
  { revalidate: 2 }
)

export default async function Page({ params }) {
  await params
  const value = await getCachedValue()
  return <main><p>{value}</p></main>
}
