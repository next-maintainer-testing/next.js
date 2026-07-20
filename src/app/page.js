import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Gallery</h1>
      <Link href="/picasso/guernica">Open art page</Link>
    </main>
  )
}
