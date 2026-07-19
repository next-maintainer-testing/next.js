import { auth } from '../../../../lib/auth.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({ configured: Boolean(auth.databaseUrl) })
}
