import './globals.css'
import CookieSetter from './cookie-setter'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <CookieSetter />
        {children}
      </body>
    </html>
  )
}
