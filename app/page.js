import { unstable_cache } from 'next/cache'
import { notFound } from 'next/navigation'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const readPublishedState = unstable_cache(
  async () => {
    const value = await readFile(path.join(process.cwd(), 'data', 'published.txt'), 'utf8')
    return value.trim() === 'published'
  },
  ['issue-72546-page-data'],
  { tags: ['issue-72546-page'] }
)

export default async function Page() {
  if (!(await readPublishedState())) {
    notFound()
  }

  return <main>EXPECTED_PAGE_AFTER_TAG_REVALIDATION</main>
}
