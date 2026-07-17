export async function GET(request) {
  const query = new URL(request.url).searchParams.get('q') || 'item'
  await new Promise((resolve) => setTimeout(resolve, 50))
  return Response.json({
    results: [{ id: '1', name: `${query} result` }],
  })
}
