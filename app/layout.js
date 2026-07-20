import './globals.css'
import localFont from 'next/font/local'

const local = localFont({ src: './font.ttf' })

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={local.className}>{children}</body>
    </html>
  )
}
