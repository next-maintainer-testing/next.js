import './globals.css'

export const metadata = {
  title: 'Dynamic hydration reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
