export default function ItemPage({ params }: { params: { slug: string } }) {
  return <main>{params.slug}</main>
}
