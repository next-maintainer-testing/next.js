import './globals.css'

export const metadata = { title: 'Issue 81732 reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
