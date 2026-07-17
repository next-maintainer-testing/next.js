import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  return <output id="as-path">{router.asPath}</output>
}
