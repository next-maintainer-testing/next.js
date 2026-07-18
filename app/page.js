import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Route handler navigation reproduction</h1>
      <Link id="route-link" href="/route" prefetch={false}>Link to /route without prefetch</Link>
    </main>
  )
}
