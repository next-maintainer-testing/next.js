export default async function MetadataPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <main>With metadata: {slug}</main>
}
