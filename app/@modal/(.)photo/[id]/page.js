export default async function PhotoModal({ params }) {
  const { id } = await params
  return <div id="photo-modal" role="dialog">Intercepted photo {id}</div>
}
