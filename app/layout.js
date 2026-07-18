import { cookies } from 'next/headers'

export default async function RootLayout({ children }) {
  const cookieStore = await cookies()
  const testCookie = cookieStore.get('test')?.value || 'missing'

  return (
    <html>
      <body data-test-cookie={testCookie}>{children}</body>
    </html>
  )
}
