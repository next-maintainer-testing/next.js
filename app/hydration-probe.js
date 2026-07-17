'use client'

import { useEffect, useState } from 'react'

export default function HydrationProbe() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    performance.mark('repro-client-hydrated')
    setHydrated(true)
  }, [])

  return <p id="hydration-state">{hydrated ? 'hydrated' : 'server-rendered'}</p>
}
