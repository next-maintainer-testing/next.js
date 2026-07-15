import Link from 'next/link'

export default function Page2() {
  return (
    <main>
      <h1 data-page="page2">Page 2</h1>
      <Link id="to-page-1" href="/page1">Page 1</Link>
    </main>
  )
}
