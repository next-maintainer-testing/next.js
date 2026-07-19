import AddItemClient from './ui/add-item'
import { fetchItems } from './lib/data'

export default async function Home() {
  const items = await fetchItems()
  return (
    <main>
      <AddItemClient />
      <p>Array length: <span id="array-length">{items.length}</span></p>
      <ul>{items.map((item) => <li key={item.id}>{item.value}</li>)}</ul>
    </main>
  )
}
