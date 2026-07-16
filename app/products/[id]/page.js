import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }) {
  const response = await fetch(`${process.env.API_ORIGIN}/${params.id}`, {
    next: { revalidate: 1 },
  })

  if (!response.ok) notFound()

  const product = await response.json()
  return <main>Product: {product.name}</main>
}
