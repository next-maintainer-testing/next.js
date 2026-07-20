import useTranslation from 'next-translate/useTranslation'

export default function Layout({ children }) {
  const { lang } = useTranslation()
  return <html lang={lang}><body>{children}</body></html>
}
