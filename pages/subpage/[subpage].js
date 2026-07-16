export default function Subpage({ page, subpage }) {
  return <main><h1>{page}</h1><p>{subpage}</p></main>
}

export function getServerSideProps({ params }) {
  return { props: { page: 'SUBPAGE', subpage: params.subpage } }
}
