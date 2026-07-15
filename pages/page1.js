import Link from 'next/link'

export default function Page1() {
  return (
    <main>
      <h1 data-page="page1">Page 1</h1>
      <Link id="to-page-2" href="/page2">Page 2</Link>
    </main>
  )
}
