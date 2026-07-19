export const metadata = { title: 'Issue 51477 reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
