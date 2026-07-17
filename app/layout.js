import './globals.css'

export default function RootLayout({ children, headerSlot }) {
  return (
    <html lang="en">
      <body>
        <header>{headerSlot}</header>
        <main>{children}</main>
      </body>
    </html>
  )
}
