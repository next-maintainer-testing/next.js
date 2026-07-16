import './globals.css'

export const metadata = { title: 'Backdrop filter reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
