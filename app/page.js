import { Suspense } from 'react'
import SearchValue from './search-value'

export default function Page() {
  return (
    <main>
      <h1 id="server-shell">Server-rendered shell</h1>
      <Suspense fallback={<p id="search-fallback">Loading search value</p>}>
        <SearchValue />
      </Suspense>
    </main>
  )
}
