import Link from 'next/link'

export default function PageZero() {
  return <main><h1>Page 0</h1><Link prefetch={false} href="/">home</Link></main>
}
