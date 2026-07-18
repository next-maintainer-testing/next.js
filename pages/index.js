import Image from 'next/image'

export default function Home() {
  return (
    <main>
      <h1>Image optimizer reproduction</h1>
      <Image src="/source.png" alt="test" width={64} height={64} />
    </main>
  )
}
