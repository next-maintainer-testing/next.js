import { NextResponse } from 'next/server'

export async function middleware(request) {
  try {
    const response = await fetch(`${request.nextUrl.origin}/api/hello`)
    return NextResponse.json({ ok: response.ok, origin: request.nextUrl.origin })
  } catch (error) {
    const cause = error?.cause || {}
    return NextResponse.json(
      {
        ok: false,
        origin: request.nextUrl.origin,
        error: {
          name: error?.name,
          message: error?.message,
          code: cause.code,
          library: cause.library,
          reason: cause.reason
        }
      },
      { status: 500 }
    )
  }
}

export const config = { matcher: '/probe' }
