import { NextResponse } from 'next/server'

export function middleware(request) {
  const match = request.nextUrl.pathname.match(/^\/product\/([^/]+)\/?$/)
  const response = NextResponse.next()
  response.headers.set('x-observed-series-code', match?.[1] || 'undefined')
  response.headers.set('x-observed-pathname', request.nextUrl.pathname)
  return response
}

export const config = {
  matcher: ['/product/:path*'],
}
