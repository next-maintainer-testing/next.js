export const dynamic = 'force-dynamic'

export async function GET() {
  const { VectorStoreIndex } = await import('llamaindex')
  return Response.json({ exportType: typeof VectorStoreIndex })
}
