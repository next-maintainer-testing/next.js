export async function GET(_request, { params }) {
  const { pathParam } = await params

  return Response.json({ pathParam })
}
