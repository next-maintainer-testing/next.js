export async function GET() {
  await new Promise((resolve) => setTimeout(resolve, 150))
  return Response.json({ ok: true })
}
