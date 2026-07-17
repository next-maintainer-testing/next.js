export default async function Intercepted({ params }) {
  const { slug } = await params
  return <h1 data-page="intercepted">Interception page for {slug}</h1>
}
