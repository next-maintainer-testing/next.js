import Link from 'next/link'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function ArchivedRevenuePage() {
  await delay(3000)
  return (
    <article data-view="archived-revenue" style={{ border: '1px solid #999', padding: 20 }}>
      <h2>Archived revenue</h2>
      <p>Archived revenue data has loaded.</p>
      <Link href="/dashboard">Back to Dashboard</Link>
    </article>
  )
}
