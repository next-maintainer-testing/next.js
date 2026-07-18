import Link from 'next/link'

export const revalidate = 1

export function generateStaticParams() {
  return [{ id: '3' }]
}

export default async function Post({ params }) {
  const { id } = await params
  const generatedAt = Date.now()
  console.log(`GENERATED post ${id}: ${generatedAt}`)

  return (
    <main>
      <h1>Post {id}</h1>
      <p id="generated-at">{generatedAt}</p>
      <Link id="home-link" href="/" prefetch={true}>
        Back to blog
      </Link>
    </main>
  )
}
