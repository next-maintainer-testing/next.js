import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function MissingPage() {
  await new Promise((resolve) => setTimeout(resolve, 250))
  notFound()
}
