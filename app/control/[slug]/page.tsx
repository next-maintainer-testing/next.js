export default async function ControlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <main>Control: {slug}</main>
}
