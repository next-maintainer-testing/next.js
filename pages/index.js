import Image from 'next/image'
import pixel from '../public/pixel.png'

export default function Home() {
  return (
    <main>
      <h1>Image basePath reproduction</h1>
      <Image src={pixel} alt="pixel" priority />
    </main>
  )
}
