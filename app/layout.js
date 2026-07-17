import Link from 'next/link'

export default function RootLayout({ children, alpha, beta }) {
  return (
    <html>
      <body>
        <main>{children}</main>
        <aside id="alpha">{alpha}</aside>
        <aside id="beta">{beta}</aside>
      </body>
    </html>
  )
}
