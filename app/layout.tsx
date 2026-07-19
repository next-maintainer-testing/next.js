import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Image metadata reproduction',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
