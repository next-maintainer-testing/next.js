import { NextResponse } from 'next/server'

export function middleware(request) {
  const response = NextResponse.next()
  if (request.headers.has('next-action')) {
    response.headers.set('x-server-action-middleware', 'observed')
  }
  return response
}

export const config = { matcher: '/:path*' }
