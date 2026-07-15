import { notFound } from 'next/navigation'

export default async function NestedDynamicPage() {
  await Promise.resolve()
  notFound()
}
