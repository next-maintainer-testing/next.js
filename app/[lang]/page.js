import useTranslation from 'next-translate/useTranslation'

export default function Home() {
  const { t } = useTranslation('home')
  return <main><h1>{t('title')}</h1></main>
}
