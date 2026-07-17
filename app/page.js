import Image from 'next/image'

export default function Page() {
  return (
    <main>
      <Image
        src="/probe.png"
        width={2}
        height={2}
        alt="optimization-probe"
        unoptimized={false}
      />
    </main>
  )
}
