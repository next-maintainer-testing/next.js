import Link from 'next/link'

export default function Page2() {
  return (
    <main style={{ minHeight: '1200px', padding: 24 }}>
      <h1>Pages Router: second page</h1>
      <Link href="/">Return with a link</Link>
    </main>
  )
}
