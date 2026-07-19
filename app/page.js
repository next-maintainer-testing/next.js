import Image from 'next/image'

export default function Page() {
  return (
    <main>
      <div id="image-parent" style={{ width: '480px', height: '320px', position: 'relative' }}>
        <Image id="fill-image" alt="test pattern" src="/test.png" fill priority />
      </div>
    </main>
  )
}
