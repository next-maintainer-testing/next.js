export function generateStaticParams() {
  return []
}

export default function Page({ params }) {
  return <main>{params.slug}</main>
}
