import Link from 'next/link'
import './globals.css'

export const metadata = { title: 'Issue 80319 reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header id="layout-header">
          <h1>Shared layout header</h1>
          <p>This layout area is taller than the viewport.</p>
        </header>
        {children}
      </body>
    </html>
  )
}
