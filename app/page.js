'use client'

import { useRouter } from 'next/navigation'

export default function Page() {
  const router = useRouter()

  return (
    <div id="scroll-container" className="scroll-container">
      <p>Type in the input. Updating the URL with router.replace must not move focus.</p>
      <div className="spacer" />
      <input
        id="query"
        aria-label="Query"
        autoComplete="off"
        onInput={(event) => {
          router.replace(`/?query=${encodeURIComponent(event.currentTarget.value)}`)
        }}
      />
      <div className="spacer" />
    </div>
  )
}
