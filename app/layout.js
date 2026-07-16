export default function RootLayout({ children, auth }) {
  const isAuthenticated = false

  return (
    <html>
      <body>{isAuthenticated ? auth : children}</body>
    </html>
  )
}
