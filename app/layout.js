import { Suspense } from 'react'
import { cookies } from 'next/headers'

export default async function RootLayout({ children }) {
  await cookies()

  return (
    <Suspense fallback={null}>
      <html lang="en">
        <body>{children}</body>
      </html>
    </Suspense>
  )
}
