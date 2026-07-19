export async function getServerSideProps({ params }) {
  return {
    props: {
      slug: params.slug || [],
    },
  }
}

export default function CatchAllPage({ slug }) {
  return <pre>{JSON.stringify({ slug })}</pre>
}
