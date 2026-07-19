import { Suspense } from 'react'
import GlobalProvider from './GlobalProvider'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Suspense fallback={<p>Loading...</p>}>
          <GlobalProvider>{children}</GlobalProvider>
        </Suspense>
      </body>
    </html>
  )
}
