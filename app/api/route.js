export const dynamic = 'error'

export async function GET(request) {
  return Response.json({ url: request.url })
}
