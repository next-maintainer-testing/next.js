export async function GET(request) {
  console.log('ISSUE_58914_ROUTE_BODY_CALLED')
  return new Response(`route-called:${request.nextUrl.pathname}`, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  })
}
