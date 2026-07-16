import { NextResponse } from 'next/server';

export function middleware(request) {
  const hostname = (request.headers.get('host') || '').split(':')[0];
  const match = hostname.match(/^([^.]+)\.localhost$/);

  if (match && request.nextUrl.pathname === '/') {
    return NextResponse.rewrite(new URL(`/s/${match[1]}`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|favicon.ico).*)'],
};
