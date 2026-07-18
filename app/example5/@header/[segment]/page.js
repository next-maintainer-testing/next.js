export default async function HeaderPage({ params }) {
  const { segment } = await params;
  return <div>Header slot: {segment}</div>;
}
