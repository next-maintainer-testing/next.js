import { useRouter } from 'next/router'

export default function Home() {
  const router = useRouter()
  return (
    <main>
      <h1>Index page</h1>
      <button onClick={() => router.push('/about')}>Open about</button>
    </main>
  )
}
