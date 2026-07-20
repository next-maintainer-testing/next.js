import { headers } from 'next/headers'

export default function RootLayout({ children }) {
  const nonce = headers().get('x-nonce') ?? undefined
  return (
    <html lang="en">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: 'window.__nonceScriptRan = true' }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
