export async function GET() {
  const upstream = process.env.UPSTREAM_URL
  const firstResponse = await fetch(`${upstream}/data/one`, { next: { tags: ['tag1'] } })
  const first = await firstResponse.json()
  const secondResponse = await fetch(`${upstream}/data/two`, { next: { tags: ['tag2'] } })
  const second = await secondResponse.json()

  return Response.json({ tag1: first.value, tag2: second.value })
}
