import { Suspense } from 'react'

export const dynamic = 'force-dynamic'

function Loader({ name }) {
  return <p data-loader={name}>Loading {name}…</p>
}

export default function DashboardLayout({ children, revenue, expenses, users }) {
  return (
    <main>
      <h1>Parallel route dashboard</h1>
      <div id="dashboard-children">{children}</div>
      <section style={{ display: 'grid', gap: 16 }}>
        <Suspense fallback={<Loader name="revenue" />}>{revenue}</Suspense>
        <Suspense fallback={<Loader name="expenses" />}>{expenses}</Suspense>
        <Suspense fallback={<Loader name="users" />}>{users}</Suspense>
      </section>
    </main>
  )
}
