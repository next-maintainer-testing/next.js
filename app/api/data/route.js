import { NextResponse } from 'next/server'

export async function GET() {
  const request = new Request(process.env.UPSTREAM_URL, {
    cache: 'force-cache',
    next: {
      revalidate: 3600,
      tags: ['test-todo'],
    },
  })

  const response = await fetch(request)
  const data = await response.json()
  return NextResponse.json(data)
}
