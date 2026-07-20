import QueryProvider from './query-provider'

export const metadata = { title: 'Back navigation server action reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body><QueryProvider>{children}</QueryProvider></body>
    </html>
  )
}