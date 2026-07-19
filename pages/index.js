import { Suspense } from 'react'

function BrowserOnlyContent() {
  if (typeof window === 'undefined') {
    throw new Error('This component only works on the client')
  }

  return <p data-testid="client-content">Client-only content rendered</p>
}

export default function Home() {
  return (
    <main>
      <h1>Suspense server error reproduction</h1>
      <Suspense fallback={<p data-testid="fallback">Loading client-only content</p>}>
        <BrowserOnlyContent />
      </Suspense>
    </main>
  )
}
