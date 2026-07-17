import type { ReactNode } from 'react'

export default function RootLayout({
  children,
  'a-b': aB,
}: Readonly<{
  children: ReactNode
  'a-b': ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {aB}
      </body>
    </html>
  )
}
