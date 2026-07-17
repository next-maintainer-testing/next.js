export const metadata = {
  title: 'Issue 78013',
  icons: {
    icon: [{ url: '/parent-icon.svg', type: 'image/svg+xml' }],
  },
}

export default function RootLayout({ children }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  )
}
