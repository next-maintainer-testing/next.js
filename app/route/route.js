import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const url = new URL(request.url)
  const entry = JSON.stringify({
    path: url.pathname,
    hasRscQuery: url.searchParams.has('_rsc'),
    rscHeader: request.headers.get('rsc')
  }) + '\n'
  await appendFile(join(process.cwd(), '.route-calls.jsonl'), entry)
  return new Response('route response', { headers: { 'content-type': 'text/plain' } })
}
