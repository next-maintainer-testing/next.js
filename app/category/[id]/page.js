import Link from 'next/link'

export default async function Category({ params }) {
  const { id } = await params
  return (
    <main>
      <h1>Category {id}</h1>
      <p>Both categories contain the same product.</p>
      <Link prefetch={false} id="product-link" href="/product/1">
        Product 1
      </Link>
    </main>
  )
}
