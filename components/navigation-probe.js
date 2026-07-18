'use client'

import { useRouter } from 'next/navigation'

export default function NavigationProbe() {
  const router = useRouter()
  return (
    <button type="button" onClick={() => router.refresh()}>
      Refresh
    </button>
  )
}
