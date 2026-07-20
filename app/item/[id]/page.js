export const dynamicParams = false

export function generateStaticParams() {
  return [{ id: '1' }, { id: '2' }, { id: '3' }]
}

export default async function ItemPage({ params }) {
  const { id } = await params
  return <main><h1>ITEM_PAGE_OK</h1><p>Item {id}</p></main>
}
