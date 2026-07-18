export default async function Page({ searchParams }) {
  const params = await searchParams
  return <main>Query: {params.query ?? "none"}</main>
}
