export default async function ProjectTokenModal({ params }) {
  const { id, token } = await params;
  return (
    <>
      <div>Intercepted</div>
      <div>Id: {id}</div>
      <div>Token: {token}</div>
    </>
  );
}
