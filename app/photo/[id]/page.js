export default async function PhotoPage({ params }) {
  const { id } = await params
  return <h1 id="photo-page">Photo page {id}</h1>
}
