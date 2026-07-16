import { NextResponse } from 'next/server'

export function middleware(request) {
  const response = NextResponse.rewrite(new URL('/upstream', request.url))
  response.headers.set('x-added-header', 'middleware-added')
  response.headers.set('x-existing-header', 'middleware-replacement')
  response.headers.delete('x-remove-header')
  return response
}

export const config = {
  matcher: '/proxy',
}
