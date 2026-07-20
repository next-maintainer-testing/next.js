import './globals.css'

export const metadata = {
  title: 'Issue 54838 reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
