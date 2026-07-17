export default async function ProjectTokenPage({ params }) {
  const { id, token } = await params;
  return (
    <>
      <div>Non-intercepted</div>
      <div>Id: {id}</div>
      <div>Token: {token}</div>
    </>
  );
}
