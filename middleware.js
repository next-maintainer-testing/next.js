import { NextResponse } from 'next/server'

export function middleware(request) {
  const hasCookie = request.cookies.get('access-cookie')?.value

  if (hasCookie) {
    return NextResponse.next()
  }

  return NextResponse.rewrite(new URL('/login', request.url))
}
