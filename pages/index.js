import Image from 'next/image'
import animated from '../public/animated.png'

export default function Home() {
  return (
    <main>
      <h1>Animated static image without a blur placeholder</h1>
      <Image src={animated} alt="animated test image" />
    </main>
  )
}
