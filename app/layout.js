import { headers } from 'next/headers'

export default async function RootLayout({ children }) {
  await headers()

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
