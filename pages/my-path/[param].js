import { useRouter } from 'next/router'

export default function DynamicRoutePage() {
  const router = useRouter()
  const value = router.isReady ? String(router.query.param) : 'router-not-ready'

  return (
    <main>
      <h1>Dynamic route/query collision</h1>
      <meta name="router-query-param" content={value} />
      <p id="router-query-param">{value}</p>
    </main>
  )
}

export function getServerSideProps() {
  return { props: {} }
}
