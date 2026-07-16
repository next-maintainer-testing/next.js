import { NextResponse } from 'next/server'

export function middleware(request) {
  const url = request.nextUrl.clone()
  if (url.searchParams.get('hello') === 'xyz' && !url.searchParams.has('identifier')) {
    url.searchParams.set('identifier', 'yolo')
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = { matcher: '/' }
