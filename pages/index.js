import Image from 'next/image'

export default function Home() {
  return (
    <main>
      <h1>URL blur placeholder reproduction</h1>
      <Image
        id="repro-image"
        src="/missing-original.png"
        alt=""
        width={320}
        height={180}
        unoptimized
        placeholder="blur"
        blurDataURL={process.env.NEXT_PUBLIC_BLUR_URL}
        priority
      />
    </main>
  )
}
