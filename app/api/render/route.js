import MarkdownIt from 'markdown-it'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const tokens = new MarkdownIt().parse('1.repro', {})
    return Response.json({ tokenTypes: tokens.map((token) => token.type) })
  } catch (error) {
    return Response.json(
      { name: error?.name, message: error?.message },
      { status: 500 }
    )
  }
}
