export default async function PhotoPage({ params }) {
  const { id } = await params;
  return <div>{id}</div>;
}
