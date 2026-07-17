import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { addItem } from './actions'

export const dynamic = 'force-dynamic'

export default function Home() {
  const exists = fs.existsSync(path.join(process.cwd(), '.item-exists'))

  return (
    <main>
      <h1>Items</h1>
      {exists ? (
        <Link href="/items/1">Open item 1</Link>
      ) : (
        <form action={addItem}>
          <button type="submit">Add item</button>
        </form>
      )}
    </main>
  )
}
