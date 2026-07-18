export function generateStaticParams() {
  return [{ slug: 'one' }, { slug: 'two' }]
}

export default async function GeneratedPage({ params }) {
  const { slug } = await params
  return <main id="result">generated route: {slug}</main>
}
