export const dynamicParams = false

export function generateStaticParams() {
  return [{ locale: 'en' }]
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params

  return (
    <html>
      <body data-locale={locale}>{children}</body>
    </html>
  )
}
