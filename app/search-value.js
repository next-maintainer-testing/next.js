'use client'

import { useSearchParams } from 'next/navigation'

export default function SearchValue() {
  const searchParams = useSearchParams()
  return <p>Query: {searchParams.get('query') || 'none'}</p>
}
