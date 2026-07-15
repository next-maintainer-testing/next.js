import Image from 'next/image'

const blurDataURL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNmZjAwZmYiLz48L3N2Zz4='

export default function Page() {
  return (
    <main>
      <Image
        id="transparent-image"
        src="/transparent.svg"
        width={128}
        height={128}
        alt="Transparent circle"
        placeholder="blur"
        blurDataURL={blurDataURL}
        priority
      />
    </main>
  )
}
