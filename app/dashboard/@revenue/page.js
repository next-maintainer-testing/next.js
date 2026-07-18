import Link from 'next/link'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function RevenuePage() {
  await delay(4000)
  return (
    <article data-view="current-revenue" style={{ border: '1px solid #999', padding: 20 }}>
      <h2>Current revenue</h2>
      <p>Revenue data has loaded.</p>
      <Link href="/dashboard/revenue/archived">View Archived Revenue Data</Link>
    </article>
  )
}
