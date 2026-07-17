import Link from 'next/link'

export default function ChildPage() {
  return (
    <main>
      <h1>Child page</h1>
      <Link href="/">Back to parent page</Link>
    </main>
  )
}

export const revalidate = 0
