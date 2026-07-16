export default async function CatchAllPage({ params }) {
  const { locale, slug } = await params
  return <main>unexpected-dynamic-locale:{locale}:{slug.join('/')}</main>
}
