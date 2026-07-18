import { NextResponse } from 'next/server';

export function middleware(request) {
  const response = NextResponse.next();
  response.headers.set('x-observed-request-url', request.url);
  response.headers.set('x-observed-next-url', request.nextUrl.href);
  return response;
}

export const config = { matcher: ['/observe'] };
