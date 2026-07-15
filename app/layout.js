import { Suspense } from 'react'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<p>ROOT_LOADING_MARKER_59521</p>}>
          {children}
        </Suspense>
      </body>
    </html>
  )
}
