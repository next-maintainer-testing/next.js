import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-issue-44654-middleware', 'ran')
  return response
}
