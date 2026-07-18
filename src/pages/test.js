export async function getServerSideProps() {
  return { props: { value: 'test' } }
}

export default function TestPage({ value }) {
  return <p>{value}</p>
}
