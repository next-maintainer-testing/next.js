export const metadata = {
  title: {
    default: 'Root fallback title',
    template: '%s | Issue 45620',
  },
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
