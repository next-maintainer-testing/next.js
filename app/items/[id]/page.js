import fs from 'node:fs'
import path from 'node:path'
import { notFound } from 'next/navigation'
import DeleteButton from './delete-button'

export const dynamic = 'force-dynamic'

export default async function ItemPage({ params }) {
  const { id } = await params
  const exists = fs.existsSync(path.join(process.cwd(), '.item-exists'))
  console.log(`DETAIL_RENDER id=${id} exists=${exists}`)

  if (!exists) notFound()

  return (
    <main>
      <h1>Item {id}</h1>
      <DeleteButton />
    </main>
  )
}
