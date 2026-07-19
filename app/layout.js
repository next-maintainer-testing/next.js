export const dynamic = 'force-dynamic'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <div>
          <h2>
            layout is rendered at <b>{new Date().getMilliseconds()}</b>
          </h2>
          {children}
        </div>
      </body>
    </html>
  )
}
