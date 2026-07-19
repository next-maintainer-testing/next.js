import { NextResponse } from 'next/server'

export function GET() {
  const response = NextResponse.json({ ok: true })
  const common = {
    name: 'session',
    value: 'fixed-value',
    path: '/',
    secure: true,
    httpOnly: true,
    sameSite: 'none',
  }

  response.cookies.set({ ...common, domain: '.example1.com' })
  response.cookies.set({ ...common, domain: '.example2.com' })
  return response
}
