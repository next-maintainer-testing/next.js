export default function Home({ generatedAt }) {
  return <main><h1>Pages Router ISR</h1><p id="generated-at">{generatedAt}</p></main>
}

export async function getStaticProps() {
  return {
    props: { generatedAt: new Date().toISOString() },
    revalidate: 3600,
  }
}
