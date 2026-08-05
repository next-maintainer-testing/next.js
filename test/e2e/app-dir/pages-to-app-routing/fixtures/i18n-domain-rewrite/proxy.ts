import { NextResponse, type NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  const hostname = request.headers.get('host')?.split(':')[0]
  const locale = hostname === 'nl.example.local' ? 'nl-NL' : 'en-US'

  return NextResponse.rewrite(new URL(`/${locale}/test`, request.url))
}

export const config = {
  matcher: '/test',
}
