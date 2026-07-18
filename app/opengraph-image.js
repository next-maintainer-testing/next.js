import { ImageResponse } from 'next/og'

export const alt = 'Issue 82177 reproduction'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const dynamic = 'force-static'

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: 'center',
        background: 'white',
        color: 'black',
        display: 'flex',
        fontSize: 64,
        height: '100%',
        justifyContent: 'center',
        width: '100%',
      }}
    >
      Static Open Graph image
    </div>,
    size
  )
}
