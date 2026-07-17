import { temporalWorkflow } from '@repro/workflows'

export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    expected: 'temporalWorkflow',
    actual: temporalWorkflow.name,
  })
}
