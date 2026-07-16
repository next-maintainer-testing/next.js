import Link from 'next/link'

export default function IndexPage({ page }) {
  return <main><h1>{page}</h1><Link href="/subpage/example">Go to subpage</Link></main>
}

export function getServerSideProps() {
  return { props: { page: 'INDEX_PAGE' } }
}
