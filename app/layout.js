export const metadata = {
  title: 'Next.js issue 75709 reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
