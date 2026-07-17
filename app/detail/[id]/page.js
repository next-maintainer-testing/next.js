'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function DetailPage({ params }) {
  const router = useRouter()
  const [refreshed, setRefreshed] = useState(false)

  useEffect(() => {
    router.refresh()
    const timer = setTimeout(() => setRefreshed(true), 500)
    return () => clearTimeout(timer)
  }, [router])

  return (
    <main data-refreshed={refreshed ? 'true' : 'false'}>
      <h1 data-page="detail">Detail Page</h1>
      <p>Showing result {params.id}</p>
      <Link href="/">Return to search</Link>
    </main>
  )
}
