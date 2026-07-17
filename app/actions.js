'use server'

import fs from 'node:fs'
import path from 'node:path'
import { revalidatePath } from 'next/cache'

const itemFile = path.join(process.cwd(), '.item-exists')

export async function addItem() {
  fs.writeFileSync(itemFile, '1')
  revalidatePath('/')
}

export async function deleteItem() {
  if (fs.existsSync(itemFile)) fs.unlinkSync(itemFile)
  revalidatePath('/')
}
