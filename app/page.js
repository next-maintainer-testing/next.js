'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function Home() {
  const [visible, setVisible] = useState(false)

  return (
    <main>
      <h1>Mixed prefetch links</h1>
      <label>
        <input
          data-show-links
          type="checkbox"
          checked={visible}
          onChange={() => setVisible((value) => !value)}
        />
        Show links
      </label>
      {visible ? (
        <div data-link-container>
          <Link href="/blog/post-1" data-link-default>
            Post 1 (default prefetch)
          </Link>
          <br />
          <Link href="/blog/post-1" prefetch={true} data-link-force-prefetch>
            Post 1 (forced full prefetch)
          </Link>
        </div>
      ) : null}
    </main>
  )
}
