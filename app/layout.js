import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script id="issue-69567-before" strategy="beforeInteractive">
          {`window.__issue69567BeforeInteractive = true; console.log('I should be beforeInteractive');`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  )
}
