import { revalidateTag } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function GET() {
  revalidateTag('tag1')
  revalidateTag('tag2')
  return Response.json({ revalidated: true })
}
