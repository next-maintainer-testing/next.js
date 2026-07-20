import { redirect } from 'next/navigation'

export function GET() {
  try {
    redirect('/destination')
  } catch {
    return new Response('caught redirect', { status: 404 })
  }
}
