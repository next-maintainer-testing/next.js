export const metadata = { title: 'Issue 51648 reproduction' }

export default function RootLayout({ children, modal }) {
  return (
    <html lang="en">
      <body>
        {children}
        {modal}
      </body>
    </html>
  )
}
