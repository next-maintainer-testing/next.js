export async function GET(request) {
  return Response.json(Object.fromEntries(request.headers.entries()));
}
