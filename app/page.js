import Link from 'next/link'

export default function Home() {
  return <Link href="/details" id="details-link" prefetch={false}>Open details</Link>
}
