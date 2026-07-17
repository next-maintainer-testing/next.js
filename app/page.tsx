import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function Page() {
  await new Promise((resolve) => setTimeout(resolve, 50))
  return (
    <main>
      <title>Metadata: Page</title>
      <h1>Page</h1>
      <Link href="/test">To Test Page</Link>
    </main>
  )
}
