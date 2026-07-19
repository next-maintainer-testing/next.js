import { ImageResponse } from 'next/og'

export const alt = 'Control image'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export function generateStaticParams() {
  return [{ slug: 'example' }]
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  console.log(`REPRO_CONTROL_RENDERED:${slug}`)

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
      Control {slug}
    </div>,
    size
  )
}
