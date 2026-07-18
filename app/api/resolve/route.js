const { existsSync } = require('node:fs')

export async function GET() {
  const resolved = require.resolve('highlight.js')
  return Response.json({ resolved, exists: existsSync(resolved) })
}
