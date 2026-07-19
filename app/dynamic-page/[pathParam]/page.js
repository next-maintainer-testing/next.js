export default async function Page({ params }) {
  const { pathParam } = await params

  return <main data-path-param={pathParam}>Dynamic page parameter</main>
}
