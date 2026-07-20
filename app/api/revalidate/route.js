import { revalidatePath } from 'next/cache'

export function GET(request) {
  const path = new URL(request.url).searchParams.get('path')
  if (!path) {
    return Response.json({ revalidated: false }, { status: 400 })
  }
  revalidatePath(path)
  return Response.json({ revalidated: true, path })
}
