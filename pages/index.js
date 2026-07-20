import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Issue 55208</h1>
      <Link id="masked-link" href="/test?id=1" as="/test/1">
        Open masked route
      </Link>
    </main>
  )
}
