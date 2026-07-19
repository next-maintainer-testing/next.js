import { NextResponse } from 'next/server'

export function middleware(request) {
  console.log(`MIDDLEWARE pathname=${request.nextUrl.pathname} locale=${request.nextUrl.locale}`)
  return NextResponse.next()
}
