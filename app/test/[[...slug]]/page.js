export const runtime = 'edge'

export default async function Page({ params }) {
  const resolvedParams = await params
  const slug = resolvedParams.slug
  const value = Array.isArray(slug) ? slug.join('/') : 'undefined'

  return (
    <main id={slug === undefined ? 'slug-missing' : 'slug-present'}>
      slug:{value};keys:{Object.keys(resolvedParams).join(',')}
    </main>
  )
}
