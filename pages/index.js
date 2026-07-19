import Image from 'next/image'

const sizes = '(max-width: 399px) 184px,(max-width: 519px) 244px,(max-width: 639px) 200px,(max-width: 767px) 156px,(max-width: 1023px) 220px,(max-width: 1279px) 280px,280px'

export default function Home() {
  return (
    <main>
      <Image
        src="/missed-target.svg"
        width={3840}
        height={2160}
        sizes={sizes}
        alt="missed target"
      />
    </main>
  )
}
