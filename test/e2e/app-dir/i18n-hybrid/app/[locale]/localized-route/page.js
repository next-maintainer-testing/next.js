import { Debug } from '../../../components/debug'

export default async function Page({ params }) {
  const { locale } = await params

  return (
    <Debug
      page="/app/[locale]/localized-route/page.js"
      pathname={`/${locale}/localized-route`}
    />
  )
}
