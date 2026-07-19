export const runtime = 'edge'

export async function GET(_request, context) {
  return Response.json({
    contextProvided: context !== undefined && context !== null,
    hasWaitUntil: typeof context?.waitUntil === 'function',
    contextKeys: context ? Object.keys(context).sort() : [],
  })
}
