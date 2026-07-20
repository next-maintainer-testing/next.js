import { useRouter } from 'next/router'

export default function Slug() {
  const { query } = useRouter()
  return <main id="route-result">SLUG_ROUTE:{query.slug}</main>
}
