'use client'

import { useSearchParams } from 'next/navigation'

export default function SearchValue() {
  const searchParams = useSearchParams()
  const value = searchParams.get('value') || 'none'

  return <p id="search-value">Search value: {value}</p>
}
