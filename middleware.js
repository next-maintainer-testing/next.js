import { NextResponse } from 'next/server'

export function middleware(request) {
  if (request.method === 'POST' && request.headers.has('next-action')) {
    return new NextResponse('Unauthorized by middleware', {
      status: 401,
      headers: { 'content-type': 'text/plain' },
    })
  }

  return NextResponse.next()
}
