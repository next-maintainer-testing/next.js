import { type NextRequest, NextResponse } from 'next/server'

interface RouteParams {
  id: string
}

export async function DELETE(
  _request: NextRequest,
  context: { params: RouteParams }
) {
  return NextResponse.json({ success: true, id: context.params.id })
}
