import { useRouter } from 'next/router'

export default function Home(props) {
  const router = useRouter()

  return (
    <main>
      <h1>i18n domain locale reproduction</h1>
      <div
        id="locale-result"
        data-context-locale={props.locale}
        data-context-default-locale={props.defaultLocale}
        data-router-locale={router.locale}
        data-router-default-locale={router.defaultLocale}
      />
    </main>
  )
}

export function getServerSideProps({ locale, defaultLocale }) {
  return {
    props: {
      locale: locale ?? null,
      defaultLocale: defaultLocale ?? null,
    },
  }
}
