import Image from 'next/image'

export default function Page() {
  return (
    <main>
      <Image
        src="https://assets.example.com/account123/photo.png"
        alt="remote"
        width={100}
        height={100}
      />
    </main>
  )
}
