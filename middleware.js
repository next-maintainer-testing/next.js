import { NextResponse } from 'next/server'

export function middleware() {
  const response = NextResponse.next()
  response.headers.set('x-edge-buffer-result', Buffer.from('edge-buffer-ok').toString('base64'))
  return response
}

export const config = {
  matcher: '/',
}
