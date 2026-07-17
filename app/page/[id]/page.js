import Link from 'next/link'

export default async function TestPage({ params }) {
  const { id } = await params
  return (
    <main>
      <h1>Page {id}</h1>
      <p>This route is requested repeatedly while the verifier measures the dev-server process tree.</p>
      <Link href="/">Home</Link>
    </main>
  )
}
