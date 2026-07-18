import Link from 'next/link'

export default function Home() {
  return (
    <main style={{ minHeight: '3600px', padding: 24, background: '#fff' }}>
      <h1>Pages Router: first page</h1>
      <p>Scroll down, navigate to page 2, then use Back.</p>
      <Link
        id="to-page-2"
        href="/page2"
        style={{ position: 'fixed', right: 24, bottom: 24, padding: 16, background: '#111', color: '#fff' }}
      >
        Go to page 2
      </Link>
      <div style={{ marginTop: 1600 }} id="scroll-marker">Expected restored position</div>
    </main>
  )
}
