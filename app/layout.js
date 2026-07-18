import Header from './header'

export const metadata = { title: 'Next.js issue 78429 reproduction' }

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  )
}
