import { Suspense } from 'react'
import Filter from './filter'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function DashboardCard({ filter }) {
  await sleep(2400)
  return <div data-testid="card">Dashboard data for {filter}</div>
}

export default async function Page({ searchParams }) {
  const { filter = 'one' } = await searchParams

  return (
    <main>
      <h1>Dashboard</h1>
      <Filter />
      <Suspense
        key={filter}
        fallback={<div data-testid="fallback">Loading dashboard…</div>}
      >
        <DashboardCard filter={filter} />
      </Suspense>
    </main>
  )
}
