export const metadata = {
  title: 'Runtime public environment reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
