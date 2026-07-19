import './globals.css'

export const metadata = {
  title: 'Issue 77549 reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
