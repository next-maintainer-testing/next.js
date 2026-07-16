import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <h1>Categories</h1>
      <Link href="/category/1">Category 1</Link>
      <Link href="/category/2">Category 2</Link>
    </main>
  )
}
