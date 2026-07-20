export const dynamic = 'force-static'

export function generateStaticParams() {
  return [{ slug: 'foo' }]
}

export default async function SlugPage({ params }) {
  const { slug } = await params
  return <main data-testid="slug-page">slug:{slug}</main>
}
