import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return NextResponse.json({ id: params.id })
}
