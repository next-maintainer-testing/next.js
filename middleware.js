import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.cookies.set('middleware-cookie', 'value', { maxAge: 60 })
  return response
}
