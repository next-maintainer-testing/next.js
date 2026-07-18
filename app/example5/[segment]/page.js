export default async function ContentPage({ params }) {
  const { segment } = await params;
  return <div>Content: {segment}</div>;
}
