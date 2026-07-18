export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'sans-serif', maxWidth: 900, margin: '40px auto' }}>
        {children}
      </body>
    </html>
  )
}
