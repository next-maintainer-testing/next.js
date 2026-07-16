'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export default function FetchingPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 1000)
    return () => clearTimeout(timer)
  }, [])

  return (
    <main>
      <div style={{ height: ready ? 1500 : 100, padding: 24, boxSizing: 'border-box' }}>
        {ready ? 'Data fetching guide content' : 'Loading guide content…'}
      </div>
      <section id="fetch-reference" style={{ minHeight: 800, padding: 24 }}>
        <h1>Fetching data</h1>
        <Link id="reference-link" href="/reference">Fetch API Reference</Link>
      </section>
    </main>
  )
}
