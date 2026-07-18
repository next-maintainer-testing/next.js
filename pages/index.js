export async function getServerSideProps() {
  return { props: { message: 'server-side home props' } }
}

export default function Home({ message }) {
  return <main id="home-props">{message}</main>
}
