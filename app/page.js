'use client'

import Link from 'next/link'

export default function Home() {
  function pushPageC() {
    window.history.pushState(null, '', '/c')
  }

  return (
    <main>
      <h1>Home Page</h1>
      <Link id="page-a" href="/a" onClick={pushPageC}>A Page</Link>
    </main>
  )
}
