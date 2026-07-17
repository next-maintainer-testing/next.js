export async function GET(request) {
  return Response.json({
    url: {
      actual: request.url.toString(),
      expected: "the public reverse-proxy URL",
    },
    headers: Array.from(request.headers.entries()),
  });
}
