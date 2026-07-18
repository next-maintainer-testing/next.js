import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function BlogPage() {
  return (
    <main>
      <h1>Blog</h1>
      <Link id="to-dashboard" href="/dashboard">To Dashboard</Link>
    </main>
  )
}
