'use client'

import { useSearchParams } from 'next/navigation'

export default function SearchModal() {
  const params = useSearchParams()

  return (
    <aside role="dialog" data-testid="search-modal">
      <h2>Intercepted search modal</h2>
      <p>{params.get('q')}</p>
    </aside>
  )
}
