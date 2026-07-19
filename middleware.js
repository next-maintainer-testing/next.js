import { NextResponse } from 'next/server'
import { payload } from './payload'

export function middleware(request) {
  if (request.headers.get('x-issue-74916') === payload.slice(0, 32)) {
    return new NextResponse(payload.slice(-32))
  }
  return NextResponse.next()
}

export const config = { matcher: '/:path*' }
