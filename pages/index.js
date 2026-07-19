export default function Home({ createdAt }) {
  return <main>{String(createdAt)}</main>
}

export async function getServerSideProps() {
  return {
    props: {
      createdAt: new Date('2023-03-01T00:00:00.000Z'),
    },
  }
}
