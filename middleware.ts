import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  url.pathname = `/en${url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ['/((?!en(?:/|$)|api|_next/static|_next/image|favicon.ico).*)'],
};
