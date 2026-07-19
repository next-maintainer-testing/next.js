'use server'

import { revalidatePath } from 'next/cache'
import { dataInMemory } from './data'

export async function createItem() {
  const before = dataInMemory.length
  dataInMemory.push({ id: String(before + 1), value: 'item (added)' })
  console.log(`CREATE_MUTATION:${before}->${dataInMemory.length}`)
  revalidatePath('/')
}
