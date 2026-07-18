'use server'

import { appendFile } from 'node:fs/promises'

export async function getStockBySlug(slug) {
  await appendFile(process.env.ACTION_LOG, `${slug}\n`)
  await new Promise((resolve) => setTimeout(resolve, 250))
  return 7
}
