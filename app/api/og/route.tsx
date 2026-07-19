import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

export function GET() {
  return new ImageResponse(
    <img
      src="https://example.com/image.png"
      width="600"
      height="400"
      alt="Example"
    />,
    { width: 600, height: 400 },
  )
}
