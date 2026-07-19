import Link from 'next/link'

export default function Layout({ children }) {
  return (
    <html>
      <body>
        <nav>
          <ul>
            <li><Link href="/">Home</Link></li>
            <li><Link href="/posts">Posts</Link></li>
          </ul>
        </nav>
        {children}
      </body>
    </html>
  )
}
