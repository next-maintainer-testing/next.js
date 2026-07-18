export const metadata = {
  title: 'useSearchParams server-rendering reproduction',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
