import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-root-middleware', 'active')
  return response
}

export const config = {
  matcher: '/:path*',
}
