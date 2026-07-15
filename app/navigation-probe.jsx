'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function NavigationProbe() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <main data-page="home" data-hydrated={hydrated ? 'true' : 'false'}>
      <h1>Home</h1>
      <Link id="target-link" href="/target" prefetch={false}>Open target</Link>
    </main>
  )
}
