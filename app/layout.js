import Link from 'next/link'

export default function RootLayout({ children, modal }) {
  return (
    <html lang="en">
      <body>
        <nav><Link id="open-photo" href="/photo/1">Open intercepted photo</Link></nav>
        <main>{children}</main>
        {modal}
      </body>
    </html>
  )
}
