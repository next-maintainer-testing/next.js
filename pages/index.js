import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  return <main>Path: {router.pathname}</main>
}
