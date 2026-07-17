import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.headers.get('next-action')) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
