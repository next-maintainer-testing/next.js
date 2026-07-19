import Link from 'next/link'

export default async function BlogPost({ params }) {
  const { id } = await params
  return (
    <main>
      <h1>Blog {id}</h1>
      <Link href="/">Home</Link>
    </main>
  )
}
