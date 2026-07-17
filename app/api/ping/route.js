export async function GET(request) {
  const url = new URL(request.url)
  return Response.json({ ok: true, request: url.searchParams.get('request') })
}
