import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.method === 'POST' && request.nextUrl.pathname === '/') {
    return NextResponse.redirect(new URL('/redirected', request.url))
  }
  return NextResponse.next()
}
