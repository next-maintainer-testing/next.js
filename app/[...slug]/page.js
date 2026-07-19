export function generateStaticParams() {
  return [{ slug: ["home"] }]
}

export default function CatchAllPage({ params }) {
  return <main>CATCH_ALL_ROUTE:{params.slug.join("/")}</main>
}
