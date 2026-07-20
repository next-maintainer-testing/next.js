import { useRouter } from 'next/router'

export default function TestPage() {
  const router = useRouter()
  return <main id="href-route">href route; id={router.query.id}</main>
}
