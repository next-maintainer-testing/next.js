import { Transformer } from '@napi-rs/image'
import { NextResponse } from 'next/server'

export async function POST(request) {
  const transformer = new Transformer(Buffer.from(await request.arrayBuffer()))
  return NextResponse.json(await transformer.metadata())
}
