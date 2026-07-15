import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ minHeight: '180vh', padding: 32 }}>
      <h1>Scroll restoration reproduction</h1>
      <p>Scroll down and follow the link, then use iOS swipe-back.</p>
      <div style={{ height: '120vh' }} />
      <Link href="/collection">GO COLL</Link>
    </main>
  )
}
