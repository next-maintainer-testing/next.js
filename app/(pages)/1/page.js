import Link from 'next/link'

export default function PageOne() {
  return <main><h1>Page 1</h1><Link prefetch={false} href="/">home</Link></main>
}
