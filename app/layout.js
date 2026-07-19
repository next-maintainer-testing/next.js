export const metadata = { title: 'FreeBSD SWC reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
