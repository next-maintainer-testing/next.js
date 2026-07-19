import { writeFile } from 'node:fs/promises'

export async function POST(request) {
  const body = await request.json()
  await writeFile('./data.json', JSON.stringify(body))
  return Response.json(body)
}
