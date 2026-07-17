import './globals.css'

export const metadata = {
  title: 'instrumentation-client top-level await reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
