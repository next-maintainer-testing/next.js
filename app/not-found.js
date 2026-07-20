import Link from 'next/link'

export default function NotFound() {
  return (
    <main data-page="not-found">
      <h1>Not found</h1>
      <Link data-home-link href="/">Go back</Link>
    </main>
  )
}
