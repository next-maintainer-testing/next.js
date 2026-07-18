export default async function Page({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  return <div>searchParams: {JSON.stringify(resolvedSearchParams)}</div>;
}
