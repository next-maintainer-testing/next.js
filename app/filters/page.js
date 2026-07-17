import Link from 'next/link'

export default function Filters() {
  return <Link prefetch={false} id="to-filters-2" href="/filters2?dupmarker=issue77847-target">Go to filters 2</Link>
}
