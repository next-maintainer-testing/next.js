import Link from 'next/link'
import ActionClient from './action-client'
import { loadNextPage } from './actions'

export default async function HomePage() {
  console.log('ROOT_PAGE_RENDERED')
  const initialPage = await loadNextPage(1)
  return (
    <main>
      <h1>Characters</h1>
      <Link id="character-link" href="/characters/1">Open character</Link>
      <ActionClient initialPage={initialPage} />
    </main>
  )
}