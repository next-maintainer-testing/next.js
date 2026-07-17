import { NextResponse } from 'next/server'

export function GET(request) {
  const url = request.nextUrl.clone()
  url.host = 'example.com'
  url.protocol = 'https:'
  return NextResponse.redirect(url)
}
