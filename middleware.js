import Redis from 'ioredis'
import { NextResponse } from 'next/server'

const redis = new Redis('redis://127.0.0.1:6379', {
  lazyConnect: true,
  maxRetriesPerRequest: 0,
})

export async function middleware() {
  await redis.set('kun', 'kun')
  return NextResponse.next()
}

export const config = {
  matcher: '/',
}
