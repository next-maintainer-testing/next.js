import Link from 'next/link'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default async function Page({ searchParams }) {
  const params = await searchParams
  const page = params?.page || '1'

  if (page !== '1') {
    await wait(2500)
  }

  return (
    <main>
      <h1>Search-param navigation</h1>
      <p data-testid="result">Results for page {page}</p>
      <Link href="/?page=2" data-testid="page-2">Go to page 2</Link>
    </main>
  )
}
