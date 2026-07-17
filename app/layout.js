import './globals.css'

export const metadata = {
  title: 'CSS HMR reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
