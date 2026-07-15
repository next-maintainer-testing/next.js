export const dynamic = 'force-dynamic'

export default async function Page() {
  const response = await fetch(`${process.env.REPRO_ORIGIN}/api/delay`, {
    cache: 'no-store',
  })
  await response.json()

  return (
    <main id="repro-content-marker">
      <h1>Server-fetched page content</h1>
    </main>
  )
}
