import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()

  return (
    <button id="navigate" onClick={() => router.push('/cars/11841')}>
      Open car
    </button>
  )
}
