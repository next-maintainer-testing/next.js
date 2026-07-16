import { revalidateTag } from 'next/cache'
import { NextResponse } from 'next/server'

export async function POST() {
  revalidateTag('test-todo')
  return NextResponse.json({ invalidated: true })
}
