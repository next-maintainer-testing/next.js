import { NextResponse } from 'next/server';
import { COOKIE_NAME } from './i18n';

export function middleware(request) {
  request.cookies.get(COOKIE_NAME);
  return NextResponse.next();
}
