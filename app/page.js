'use client'

import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Products</h1>
      <Link data-testid="open-product" href="/product/1">Open product</Link>
    </main>
  )
}
