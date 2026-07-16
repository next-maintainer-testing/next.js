export default function DynamicPage({ page, whatever }) {
  return <main><h1>{page}</h1><p>{whatever}</p></main>
}

export function getServerSideProps({ params }) {
  return { props: { page: 'DYNAMIC_PAGE', whatever: params.whatever } }
}
