import { NextResponse } from 'next/server'

export function middleware(request) {
  const redirectUrl = request.nextUrl.clone()
  redirectUrl.hostname = 'localhost'
  redirectUrl.pathname = '/signin'
  redirectUrl.search = '?domainKey=foobar'
  return NextResponse.redirect(redirectUrl)
}

export const config = {
  matcher: '/',
}
