export default function LanguageLayout({ children, params: { lang } }) {
  return (
    <html lang={lang}>
      <body>
        <p>This is app/[lang] layout</p>
        {children}
      </body>
    </html>
  )
}
