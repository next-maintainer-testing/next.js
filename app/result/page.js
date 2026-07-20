export default async function ResultPage({ searchParams }) {
  const params = await searchParams
  return <main>Internal response Set-Cookie: {params.internalSetCookie}</main>
}
