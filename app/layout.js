import Link from 'next/link'

export const metadata = {
  title: 'Current-page Link focus reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <header id="shared-layout-header" style={{ minHeight: '140vh' }}>
          <Link id="home-link" href="/">Home</Link>
          <p>This tall shared layout navigation places the page content below the viewport.</p>
        </header>
        {children}
      </body>
    </html>
  )
}
