import Link from 'next/link'

export default function Home() {
  return <Link prefetch={false} id="to-filters" href="/filters?dupmarker=issue77847-first">Go to filters</Link>
}
