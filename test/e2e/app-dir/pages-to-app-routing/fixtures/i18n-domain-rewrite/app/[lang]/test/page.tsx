export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  return <p id="app-router-locale">{lang}</p>
}
