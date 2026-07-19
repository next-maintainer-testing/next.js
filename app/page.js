import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1 id="home-title">Home page</h1>
      <Link id="to-page-2" href="/page2">Page 2</Link>
    </main>
  )
}
