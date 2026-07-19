import { NextResponse } from 'next/server'

export function middleware(request) {
  const login = request.cookies.get('login')
  if (!login) {
    return NextResponse.redirect(new URL('/?login=0', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/login'],
}
