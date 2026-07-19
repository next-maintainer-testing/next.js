import { ImageResponse } from 'next/og'

export const alt = 'Image with generated metadata'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export function generateStaticParams() {
  return [{ slug: 'example' }]
}

export async function generateImageMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  console.log(`REPRO_METADATA_CALLED:${slug}`)
  return [{ id: 'card', alt, size, contentType }]
}

export default async function Image({
  params,
  id,
}: {
  params: Promise<{ slug: string }>
  id: string
}) {
  const { slug } = await params
  console.log(`REPRO_WITH_METADATA_RENDERED:${slug}:${id}`)

  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: 'white',
        color: 'black',
        display: 'flex',
        fontSize: 72,
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      Metadata {slug} {id}
    </div>,
    size
  )
}
