import { useEffect } from 'react'
import Image from 'next/image'

export default function Home() {
  useEffect(() => {
    document.body.dataset.hydrated = 'true'
  }, [])

  return (
    <main>
      <h1>Fractional next/image dimensions</h1>
      <Image src="/test.svg" alt="test" width={10.5} height={10} priority />
    </main>
  )
}
