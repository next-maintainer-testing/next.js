'use client'

import { useRouter, useSearchParams } from 'next/navigation'

export default function Filter() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const current = searchParams.get('filter') || 'one'
  const next = current === 'one' ? 'two' : 'one'

  return (
    <button
      data-testid="filter"
      onClick={() => router.push(`/?filter=${next}`, { scroll: false })}
    >
      Show {next}
    </button>
  )
}
