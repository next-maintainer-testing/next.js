'use client'

import { createItem } from '../lib/actions'

export default function AddItemClient() {
  return (
    <form action={createItem}>
      <button type="submit">Add Item</button>
    </form>
  )
}
