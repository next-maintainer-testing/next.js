export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json({ nodeEnv: process.env.NODE_ENV })
}
