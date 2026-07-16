import Link from 'next/link'

export default function Home() {
  return (
    <main>
      <Link prefetch={false} href="/0">page 0</Link>{' '}
      <Link prefetch={false} href="/1">page 1</Link>
    </main>
  )
}
