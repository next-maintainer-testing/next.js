import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script data-id="layout" />
      </body>
    </html>
  )
}

export const revalidate = 0
