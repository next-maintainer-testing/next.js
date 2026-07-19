import Image from 'next/image'

export default function Home() {
  return (
    <main>
      <div style={{ width: 100, height: 100, overflow: 'hidden' }}>
        <Image
          id="intrinsic-large"
          src="/large.png"
          alt="Large intrinsic dimensions"
          width={5000}
          height={5000}
          style={{ width: 100, height: 100 }}
        />
      </div>
      <div style={{ width: 100, height: 100, overflow: 'hidden' }}>
        <Image
          id="desired-small"
          src="/large.png"
          alt="Desired display dimensions"
          width={100}
          height={100}
          style={{ width: 100, height: 100 }}
        />
      </div>
    </main>
  )
}
