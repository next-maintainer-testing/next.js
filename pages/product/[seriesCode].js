import Link from 'next/link'
import { useRouter } from 'next/router'

export default function Product() {
  const router = useRouter()
  return (
    <main>
      <p id="series-code">{String(router.query.seriesCode)}</p>
      <p id="query-state">{JSON.stringify(router.query)}</p>
      <Link id="next-product" href={{ pathname: '/product/[seriesCode]/', query: { seriesCode: '5678', Page: '3' } }}>
        Next product
      </Link>
    </main>
  )
}

export async function getServerSideProps() {
  return { props: {} }
}
