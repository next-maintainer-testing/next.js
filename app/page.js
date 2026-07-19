import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Static export</h1>
      <Link href="/article">Open article</Link>
    </main>
  )
}
