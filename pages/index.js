import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1 data-page="home">Home</h1>
      <Link id="page-1" href="/page1">Page 1</Link>{' '}
      <Link id="page-2" href="/page2">Page 2</Link>
    </main>
  )
}
