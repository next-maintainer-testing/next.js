const loadedAt = new Date().toISOString()

console.log(`ISSUE_51340_MODULE_LOAD:${loadedAt}`)

export async function GET() {
  console.log(`ISSUE_51340_GET:${loadedAt}`)
  return Response.json({ loadedAt })
}
