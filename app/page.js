export const dynamic = 'force-dynamic'

export default async function Page() {
  const response = await fetch(process.env.UPSTREAM_URL)
  await response.body?.cancel()

  return <main>response body cancellation resolved</main>
}
