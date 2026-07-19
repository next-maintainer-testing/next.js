'use client'

import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  return (
    <main>
      <p>This page intentionally has no title or heading.</p>
      <button id="go" onClick={() => router.push('/target')}>
        Open target route
      </button>
    </main>
  )
}
