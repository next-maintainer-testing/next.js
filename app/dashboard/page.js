import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <main>
      <h1>Dashboard</h1>
      <Link id="to-blog" href="/dashboard/blog">To Blog</Link>
    </main>
  )
}
