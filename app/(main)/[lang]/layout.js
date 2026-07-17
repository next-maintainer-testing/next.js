export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function LocalizedLayout({ children, params }) {
  return (
    <html lang={params.lang}>
      <body>{children}</body>
    </html>
  )
}
