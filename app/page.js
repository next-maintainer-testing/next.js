import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Home</h1>
      <Link href="/page-a" prefetch={true} id="page-a-link">
        Go to Page A
      </Link>
    </main>
  )
}
