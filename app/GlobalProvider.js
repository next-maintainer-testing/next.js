'use client'

import { useSearchParams } from 'next/navigation'

export default function GlobalProvider({ children }) {
  useSearchParams()
  console.log('ISSUE_56262_CLIENT_COMPONENT_SERVER_RENDER')
  const currentUrl = window.location.href

  return (
    <main>
      <p>{currentUrl}</p>
      {children}
    </main>
  )
}
