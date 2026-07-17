import axios from 'axios'
import { NextResponse } from 'next/server'

export async function middleware() {
  await axios.get('http://127.0.0.1:4000/', {
    signal: AbortSignal.timeout(1000),
    adapter: 'fetch',
  })
  return NextResponse.next()
}

export const config = { matcher: '/leak' }
