export default function RootLayout({ children, modal }) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
        {modal}
      </body>
    </html>
  )
}
