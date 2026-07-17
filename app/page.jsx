'use client'

import Link from 'next/link'

const spacer = {
  minHeight: '120vh',
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'flex-end',
}

export default function Page() {
  return (
    <main>
      <nav aria-label="Hash navigation">
        <Link id="next-link" href="#next-target">Next Link target</Link>
        {' | '}
        <a id="native-link" href="#native-target">Native anchor target</a>
      </nav>

      <section style={spacer}>
        <h2 id="next-target">Next Link target</h2>
        <button id="next-after" type="button">Focusable after Next target</button>
      </section>

      <section style={spacer}>
        <h2 id="native-target">Native anchor target</h2>
        <button id="native-after" type="button">Focusable after native target</button>
      </section>
    </main>
  )
}
