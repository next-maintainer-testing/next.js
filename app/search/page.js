'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function SearchPage() {
  const router = useRouter()
  const params = useSearchParams()

  return (
    <main data-testid="full-search">
      <h1>Full search page</h1>
      <p data-testid="full-query">{params.get('q')}</p>
      <button onClick={() => router.replace('/search?q=updated')}>
        Update query
      </button>
    </main>
  )
}
