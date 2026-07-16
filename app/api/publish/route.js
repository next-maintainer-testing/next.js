import { revalidateTag } from 'next/cache'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export async function POST() {
  await writeFile(path.join(process.cwd(), 'data', 'published.txt'), 'published\n')
  revalidateTag('issue-72546-page')

  return Response.json({ published: true, revalidatedTag: 'issue-72546-page' })
}
