import Image from 'next/image'

export default function Page() {
  const imageData = { src: '/source.svg', width: '300', height: '200' }
  const aspectRatioHeight = (+imageData.height / +imageData.width) * 200

  return (
    <main>
      <Image
        src={imageData.src}
        alt="Fractional dimensions reproduction"
        width={200}
        height={aspectRatioHeight}
      />
    </main>
  )
}
