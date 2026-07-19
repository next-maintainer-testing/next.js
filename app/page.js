'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <button id="set-cookie" type="button" onClick={() => { document.cookie = 'login=1; path=/' }}>
        Set Cookie
      </button>
      <button id="delete-cookie" type="button" onClick={() => { document.cookie = 'login=; path=/; max-age=0' }}>
        Delete Cookie
      </button>
      <Link id="authenticated-route" href="/login">Authenticated Route</Link>
    </main>
  )
}
