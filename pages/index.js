import Image from 'next/image'
import alphaImage from '../public/alpha.webp'

export default function Home() {
  return (
    <main style={{ background: 'white' }}>
      <h1>Transparent WebP</h1>
      <Image src={alphaImage} alt="transparent WebP test image" />
    </main>
  )
}
