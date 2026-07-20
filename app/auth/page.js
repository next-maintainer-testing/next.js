import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AuthPage({ searchParams }) {
  const params = await searchParams
  const response = await fetch(`${process.env.APP_ORIGIN}/api/auth/mock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tokenAccess: params.tokenAccess || '1234' }),
    cache: 'no-store',
  })

  const internalResponseSetCookie = response.headers.get('set-cookie')
  redirect(`/result?internalSetCookie=${internalResponseSetCookie ? 'yes' : 'no'}`)
}
