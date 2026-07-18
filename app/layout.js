import './bootstrap.min.css'

export const metadata = { title: 'CSS map reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
