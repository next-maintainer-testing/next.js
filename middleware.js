import { cache } from 'react'
import { NextResponse } from 'next/server'

let calls = 0

const loadForRequest = cache(async (key) => {
  calls += 1
  return { key, call: calls }
})

export async function middleware(request) {
  if (request.nextUrl.pathname !== '/probe') {
    return NextResponse.next()
  }

  calls = 0
  const first = await loadForRequest('same-key')
  const second = await loadForRequest('same-key')

  return NextResponse.json({
    calls,
    sameResult: first === second,
    first,
    second,
  })
}

export const config = {
  matcher: '/probe',
}
