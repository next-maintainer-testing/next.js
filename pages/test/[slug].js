import { useRouter } from 'next/router'

export default function MaskedPathPage() {
  const router = useRouter()
  return <main id="as-route">as route; slug={router.query.slug}; id={router.query.id}</main>
}
