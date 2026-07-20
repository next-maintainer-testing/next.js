import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request) {
  const { tokenAccess } = await request.json()
  const cookieStore = await cookies()

  cookieStore.set('MOCK_ACCESS_TOKEN', tokenAccess || '1234', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60,
  })

  return NextResponse.json({ ok: true })
}
