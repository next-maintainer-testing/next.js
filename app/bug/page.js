'use client'

export default async function BugPage() {
  const response = await fetch('/api/backend', { cache: 'no-store' })
  const data = await response.json()

  return <main>Backend response: {data.ok ? 'ok' : 'error'}</main>
}
