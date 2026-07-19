import { NextResponse } from 'next/server'

export function middleware(request) {
  return NextResponse.redirect(new URL('/test/redirected', request.url))
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
