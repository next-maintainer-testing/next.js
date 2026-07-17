export default function LocaleLayout({ children, params }) {
  return (
    <html lang={params.lng}>
      <body>{children}</body>
    </html>
  )
}
