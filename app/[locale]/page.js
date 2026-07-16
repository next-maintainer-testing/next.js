export default async function LocalePage({ params }) {
  const { locale } = await params
  return <main>locale-index:{locale}</main>
}
