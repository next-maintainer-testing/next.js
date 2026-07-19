import { NextResponse } from 'next/server'

export function middleware(request) {
  const { pathname } = request.nextUrl

  if (!pathname.startsWith('/en')) {
    return NextResponse.redirect(new URL(`/en${pathname}`, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
}
