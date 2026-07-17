import SearchClient from './search-client'

export const dynamic = 'force-dynamic'

export default async function SearchPage() {
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return <SearchClient />
}
