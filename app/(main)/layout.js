async function getData() {
  const response = await fetch(process.env.REPRO_UPSTREAM_URL, {
    method: 'GET',
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`upstream returned ${response.status}`)
  return response.json()
}

export const metadata = { title: 'Main Group' }

export default async function MainLayout({ children }) {
  const first = await getData()
  const second = await getData()

  return (
    <main>
      <output id="fetch-results">{first.requestId},{second.requestId}</output>
      {children}
    </main>
  )
}
