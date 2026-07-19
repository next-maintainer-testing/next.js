'use client'

import Link from 'next/link'
import { useState } from 'react'

const initialItems = [1, 2, 3]

export default function Home() {
  const [items, setItems] = useState(initialItems)

  return (
    <main>
      <h1>Posts</h1>
      <p data-testid="item-count">{items.length}</p>
      <ul>{items.map((item) => <li key={item}>Post {item}</li>)}</ul>
      <button data-testid="load-more" onClick={() => setItems((old) => [...old, old.length + 1, old.length + 2, old.length + 3])}>
        Load more
      </button>
      <Link data-testid="go-to-10" href="/blog/10">Go to 10</Link>
    </main>
  )
}
